const BASE = '/api';

/* ─── CSRF Token ─── */
let csrfToken = '';

async function initCSRF(): Promise<void> {
  try {
    const res = await fetch('/api/csrf-token');
    const data = await res.json();
    csrfToken = data.token || '';
  } catch {
    // CSRF token not available — will work if auth is disabled
  }
}
// Fetch on load
initCSRF();

/* ─── Device lookup cache (for climate setpoints) ─── */
let deviceCache: import('../types').Device[] | null = null;

async function getDeviceCache(): Promise<import('../types').Device[]> {
  if (deviceCache) return deviceCache;
  const data = await request<{ ok: boolean; devices: RawDevice[] }>('/devices');
  deviceCache = data.devices.map(mapDevice);
  return deviceCache;
}

/** Simulated data when API is unavailable (offline/demo mode) */
let isOnline = true;

export function setOnline(state: boolean) {
  isOnline = state;
}

export function getOnline() {
  return isOnline;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!isOnline) {
    throw new Error('OFFLINE');
  }
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> || {}),
    };
    
    // Add CSRF token for mutating requests
    const method = options?.method || 'GET';
    if (csrfToken && ['POST', 'PUT', 'DELETE'].includes(method)) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
      credentials: 'include',
    });
    
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    try {
      return (await res.json()) as T;
    } catch (cause) {
      throw new Error(`Invalid JSON from ${path}`, { cause: cause as Error });
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function unwrap<T>(promise: Promise<T & { ok?: boolean }>): Promise<T> {
  const data = await promise;
  if (data && typeof data === 'object' && 'ok' in data) {
    if ((data as { ok: boolean }).ok !== true) {
      throw new Error('API returned ok: false');
    }
    return data as T;
  }
  return data as T;
}

/* ─── Raw API types ─── */

interface RawDevice {
  ieee_addr: string;
  friendly_name: string;
  type: string;
  room_name?: string;
  room_icon?: string;
  status: string;
  latest_telemetry?: { power?: number; linkquality?: number }[];
}

interface RawSetpoint {
  device_ieee: string;
  target_temp: number;
  mode: string;
  current_temp: number | null;
  current_humidity: number | null;
}

interface RawScenario {
  id: number;
  name: string;
  triggers_json: string;
  actions_json: string;
  active: boolean;
}

interface RawGate {
  ieee_addr: string;
  friendly_name: string;
  status: string;
}

interface RawErrorEvent {
  id: number;
  device_ieee: string | null;
  error_type: string;
  error_msg: string;
  context: string;
  ts: string;
}

interface RawCommandEvent {
  id: number;
  device_ieee: string;
  command: string;
  payload: string;
  status: string;
  error_msg: string | null;
  source: string;
  sent_at: string;
  completed_at: string | null;
}

interface RawStateChange {
  id: number;
  device_ieee: string;
  old_state: string;
  new_state: string;
  reason: string;
  ts: string;
}

/* ─── Mapping functions ─── */

function mapDevice(d: RawDevice): import('../types').Device {
  const telemetry = d.latest_telemetry?.[0];
  return {
    id: d.ieee_addr,
    name: d.friendly_name,
    type: d.type,
    room: d.room_name || '—',
    online: d.status === 'online',
    ...(telemetry && {
      power: telemetry.power,
      rssi: telemetry.linkquality,
    }),
  };
}

function mapSetpoint(
  s: RawSetpoint,
  device?: import('../types').Device,
): import('../types').ClimateSetpoint {
  return {
    id: s.device_ieee,
    name: device?.name || s.device_ieee.replace(/_/g, ' '),
    room: device?.room || '—',
    currentTemp: s.current_temp ?? 0,
    targetTemp: s.target_temp,
    mode: (['heat', 'cool', 'auto', 'off'].includes(s.mode) ? s.mode : 'auto') as import('../types').ClimateSetpoint['mode'],
    online: device?.online ?? true,
  };
}

function parseTrigger(triggersJson: string): string {
  try {
    const t = JSON.parse(triggersJson);
    if (t.conditions?.length) {
      const c = t.conditions[0];
      return `${c.device || '?'} ${c.property || ''} ${c.operator || '?'} ${c.value ?? ''}`;
    }
    if (t.cron) return `CRON: ${t.cron}`;
    if (t.sun) return `Солнце: ${t.sun}`;
  } catch { /* fall through */ }
  return '—';
}

function parseActions(actionsJson: string): string[] {
  try {
    const arr = JSON.parse(actionsJson) as { type: string; device?: string; command?: string; message?: string }[];
    return arr.map(a => {
      if (a.type === 'notify') return a.message || 'Уведомление';
      if (a.type === 'mqtt') return `${a.device || '?'}: ${a.command || '?'}`;
      return `${a.type}: ${a.device || ''}`;
    });
  } catch {
    return ['—'];
  }
}

function mapScenario(s: RawScenario): import('../types').Scenario {
  return {
    id: String(s.id),
    name: s.name,
    trigger: parseTrigger(s.triggers_json),
    actions: parseActions(s.actions_json),
    active: s.active,
  };
}

function mapGate(g: RawGate): import('../types').Gate {
  return {
    id: g.ieee_addr,
    name: g.friendly_name,
    status: 'closed', // API doesn't track open/closed, default to closed
    online: g.status === 'online',
  };
}

function mapErrorEvent(e: RawErrorEvent): import('../types').EstateEvent {
  return {
    id: `err-${e.id}`,
    type: 'error',
    title: e.error_msg,
    details: e.context || e.error_type,
    ts: e.ts,
  };
}

function mapCommandEvent(c: RawCommandEvent): import('../types').EstateEvent {
  return {
    id: `cmd-${c.id}`,
    type: 'command',
    title: `${c.device_ieee}: ${c.command}`,
    details: `${c.status}${c.error_msg ? ` (${c.error_msg})` : ''}`,
    ts: c.sent_at,
  };
}

function mapStateChange(s: RawStateChange): import('../types').EstateEvent {
  return {
    id: `st-${s.id}`,
    type: 'state',
    title: `${s.device_ieee}: ${s.old_state} → ${s.new_state}`,
    details: s.reason,
    ts: s.ts,
  };
}

/* ─── Public API ─── */

export const api = {
  getStatus: () => request<import('../types').ServerStatus>('/status'),

  getDashboard: () =>
    unwrap<import('../types').DashboardData>(request('/dashboard')),

  getDevices: async () => {
    const data = await request<{ ok: boolean; devices: RawDevice[] }>('/devices');
    const devices = data.devices.map(mapDevice);
    deviceCache = devices; // refresh cache
    return devices;
  },

  getScenarios: async () => {
    const data = await request<{ ok: boolean; scenarios: RawScenario[] }>('/scenarios');
    return data.scenarios.map(mapScenario);
  },

  getClimate: async () => {
    const [setpointsData, devices] = await Promise.all([
      request<{ ok: boolean; setpoints: RawSetpoint[] }>('/climate'),
      getDeviceCache(),
    ]);
    const deviceMap = new Map(devices.map(d => [d.id, d]));
    return setpointsData.setpoints.map(s => mapSetpoint(s, deviceMap.get(s.device_ieee)));
  },

  updateClimate: (id: string, targetTemp: number, mode: import('../types').ClimateSetpoint['mode']) =>
    request(`/climate/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ targetTemp, mode }),
    }),

  getGates: async () => {
    const data = await request<{ ok: boolean; gates: RawGate[] }>('/gates');
    return data.gates.map(mapGate);
  },

  openGate: (id: string) => request<{ ok: boolean; device: string; state: string; command_id: number }>(`/gates/${id}/open`, { method: 'POST' }),
  closeGate: (id: string) => request<{ ok: boolean; device: string; state: string; command_id: number }>(`/gates/${id}/close`, { method: 'POST' }),

  getEvents: async () => {
    const data = await request<{
      ok: boolean;
      errors: RawErrorEvent[];
      commands: RawCommandEvent[];
      state_changes: RawStateChange[];
    }>('/events');
    return [
      ...data.errors.map(mapErrorEvent),
      ...data.commands.map(mapCommandEvent),
      ...data.state_changes.map(mapStateChange),
    ];
  },

  sendClientLogs: (logs: unknown[]) =>
    request('/client-logs', {
      method: 'POST',
      body: JSON.stringify({ logs }),
    }),

  toggleLight: (roomId: string) =>
    request(`/rooms/${roomId}/light/toggle`, { method: 'POST' }),

  deviceOn: (id: string) =>
    request(`/devices/${id}/on`, { method: 'POST' }),

  deviceOff: (id: string) =>
    request(`/devices/${id}/off`, { method: 'POST' }),

  overrideRoom: (roomId: string, duration: number) =>
    request(`/rooms/${roomId}/override`, {
      method: 'POST',
      body: JSON.stringify({ duration }),
    }),

  voiceCommand: (text: string) =>
    request<{ text: string; action: string }>('/voice', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  createDevice: (ieee_addr: string, friendly_name: string, type: string, room_id?: number) =>
    request<{ ok: boolean; device: any }>('/devices', {
      method: 'POST',
      body: JSON.stringify({ ieee_addr, friendly_name, type, room_id }),
    }),

  deleteDevice: (id: string) =>
    request<{ ok: boolean; deleted: string }>(`/devices/${id}`, {
      method: 'DELETE',
    }),

  getRooms: () =>
    request<{ ok: boolean; rooms: { id: number; name: string; icon: string }[] }>('/rooms'),

  getRoomDevices: (roomId: string) =>
    request<{ ok: boolean; devices: any[] }>(`/rooms/${roomId}/devices`),

  getRoomClimate: (roomId: string) =>
    request<{ ok: boolean; climate: any[] }>(`/rooms/${roomId}/climate`),

  createRoom: (name: string, icon: string) =>
    request<{ ok: boolean; room: any }>('/rooms', {
      method: 'POST',
      body: JSON.stringify({ name, icon }),
    }),

  deleteRoom: (id: number) =>
    request<{ ok: boolean; deleted: any }>(`/rooms/${id}`, {
      method: 'DELETE',
    }),

  updateDevice: (id: string, updates: { friendly_name?: string; type?: string; room_id?: number }) =>
    request<{ ok: boolean; device: any }>(`/devices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  getPendingDevices: () =>
    request<{ ok: boolean; pending: any[]; reason?: string }>('/devices/pending'),

  discoverDevices: () =>
    request<{ ok: boolean; permit_join: boolean; discovered: any[]; reason?: string }>('/devices/discover', {
      method: 'POST',
    }),
};
