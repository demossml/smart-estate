const BASE = '/api';

/* ─── API Key ───
 * НАХОДКА (Модуль 8, главная за весь фронтенд): localStorage.getItem('apiKey')
 * использовался ТОЛЬКО при запросе CSRF-токена — ни на один реальный
 * запрос (/devices, /scenarios, /gates и т.д.) заголовок X-API-Key никогда
 * не отправлялся. При этом НИГДЕ в приложении нет localStorage.setItem('apiKey', ...) —
 * то есть ключу неоткуда взяться в принципе, это не просто пропущенный заголовок,
 * а полностью отсутствующий UX-флоу входа.
 * После фикса бэкенда (Модуль 1: API_KEYS обязателен, сервер не стартует без него)
 * это означает, что фронтенд не смог бы авторизоваться НИ НА ОДНОМ запросе —
 * всё приложение отвечало бы 401.
 * Здесь чиню техническую часть (реально отправлять заголовок, если ключ есть
 * в localStorage) — но САМ способ, которым пользователь вводит ключ в
 * приложение (экран настроек? QR-код? PIN?) — открытый вопрос, я не стал
 * изобретать UI для этого сам. См. PATCH_INSTRUCTIONS.md, Модуль 8.
 */
export function getApiKey(): string {
  return localStorage.getItem('apiKey') || '';
}

export function setApiKey(key: string): void {
  localStorage.setItem('apiKey', key);
}

/* ─── Online state ─── */
// Должно быть объявлено ДО initCSRF(), так как request() использует isOnline
let isOnline = navigator.onLine;
window.addEventListener('online', () => { isOnline = true; });
window.addEventListener('offline', () => { isOnline = false; });

/* ─── CSRF Token ─── */
let csrfToken = '';

async function initCSRF(): Promise<void> {
  try {
    const res = await fetch('/api/csrf-token', { headers: { 'X-API-Key': getApiKey() } });
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

export function setOnline(state: boolean) {
  isOnline = state;
}

export function getOnline() {
  return isOnline;
}

/**
 * НАХОДКА: раньше `if (!res.ok) throw new Error(...)` использовал только
 * res.status/statusText, полностью отбрасывая JSON-тело ответа. После фиксов
 * бэкенда (Модуль 3/7) многие эндпоинты теперь возвращают осмысленный
 * `{ok:false, error:"MQTT недоступен, команда не отправлена"}` при 503 —
 * но пользователь видел бы только "503 Service Unavailable" без объяснения.
 * Теперь пытаемся распарсить тело ответа даже при ошибке и используем
 * error-поле, если оно есть.
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!isOnline) {
    throw new Error('OFFLINE');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': getApiKey(),
      ...(options?.headers as Record<string, string> || {}),
    };

    // Add CSRF token for mutating requests
    const method = options?.method || 'GET';
    if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
      credentials: 'include',
    });

    if (!res.ok) {
      // Пытаемся достать осмысленное сообщение из тела ответа перед тем,
      // как падать на голый статус-код.
      let serverMessage: string | undefined;
      try {
        const body = await res.clone().json();
        serverMessage = body?.error;
      } catch {
        // Тело не JSON или пустое — используем только статус
      }
      throw new Error(serverMessage || `${res.status} ${res.statusText}`);
    }
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
  last_seen?: string | null;
  battery_level?: number | null;
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
    battery_level: d.battery_level ?? null,
    last_seen: d.last_seen ?? null,
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
    // NEW format: array of trigger objects
    if (Array.isArray(t) && t.length > 0) {
      const c = t[0];
      if (c.type === 'schedule') {
        if (c.cron) return `CRON: ${c.cron}`;
        if (c.kind === 'sunset') return `Закат${c.offset_minutes ? ` ${c.offset_minutes > 0 ? '+' : ''}${c.offset_minutes}мин` : ''}`;
        if (c.kind === 'sunrise') return `Рассвет${c.offset_minutes ? ` ${c.offset_minutes > 0 ? '+' : ''}${c.offset_minutes}мин` : ''}`;
        return `Время: ${c.time || '?'}`;
      }
      return `${c.device || '?'} ${c.property || ''} ${c.operator || '?'} ${c.value ?? ''}`;
    }
    // OLD format: { logic, conditions }
    if (t.conditions?.length) {
      const c = t.conditions[0];
      return `${c.device || '?'} ${c.property || ''} ${c.operator || '?'} ${c.value ?? ''}`;
    }
    if (t.cron) return `CRON: ${t.cron}`;
    if (t.sun) return `Солнце: ${t.sun}`;
  } catch { /* fall through */ }
  return '—';
}

function mapScenario(s: RawScenario): import('../types').Scenario {
  return {
    id: String(s.id),
    name: s.name,
    trigger: parseTrigger(s.triggers_json),
    actions: parseClientActions(s.actions_json),
    active: s.active,
    triggers_json: s.triggers_json,
    actions_json: s.actions_json,
  };
}

function parseClientActions(actionsJson: string): string[] {
  try {
    const arr = JSON.parse(actionsJson) as { type: string; device?: string; command?: string; message?: string; seconds?: number }[];
    return arr.map(a => {
      if (a.type === 'notify') return a.message || 'Уведомление';
      if (a.type === 'device_command' || a.type === 'mqtt') return `${a.device || '?'}: ${a.command || '?'}`;
      if (a.type === 'delay') return `Пауза ${a.seconds || '?'}с`;
      return `${a.type}: ${a.device || ''}`;
    });
  } catch {
    return ['—'];
  }
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

  createScenario: (name: string, triggers: string, actions: string) =>
    request<{ ok: boolean; id: number }>('/scenarios', {
      method: 'POST',
      body: JSON.stringify({ name, triggers_json: triggers, actions_json: actions, active: true }),
    }),

  updateScenario: (id: string, name: string, triggers: string, actions: string) =>
    request<{ ok: boolean }>(`/scenarios/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, triggers_json: triggers, actions_json: actions }),
    }),

  deleteScenario: (id: string) =>
    request<{ ok: boolean }>(`/scenarios/${id}`, { method: 'DELETE' }),

  toggleScenario: (id: string) =>
    request<{ ok: boolean }>(`/scenarios/${id}/toggle`, { method: 'POST' }),

  getClimate: async () => {
    const [setpointsData, devices] = await Promise.all([
      request<{ ok: boolean; rooms: RawSetpoint[] }>('/climate'),
      getDeviceCache(),
    ]);
    const deviceMap = new Map(devices.map(d => [d.id, d]));
    return setpointsData.rooms.map(s => mapSetpoint(s, deviceMap.get(s.device_ieee)));
  },

  // НАХОДКА (Модуль 8): раньше отправлялось { targetTemp, mode } (camelCase),
  // а бэкенд (PUT /api/climate/:device_ieee) деструктурирует req.body как
  // { target_temp, mode, ... } — snake_case. targetTemp просто игнорировался
  // (undefined), апдейт молча не применялся, бэкенд отвечал 200 OK с
  // НЕИЗМЕНЁННЫМ setpoint — пользователь думал, что температура сохранилась,
  // а на деле ничего не менялось. Подтверждено: pages/Climate.tsx использует
  // именно этот метод. App.tsx (свой отдельный, дублирующий клиент) уже
  // отправлял правильное имя поля — рассинхрон между двумя копиями клиента.
  updateClimate: (id: string, targetTemp: number, mode: import('../types').ClimateSetpoint['mode']) =>
    request(`/climate/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ target_temp: targetTemp, mode }),
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

  // НАХОДКА: /api/rooms/:id/light/toggle НЕ СУЩЕСТВУЕТ на бэкенде (проверено
  // построчным grep по api.ts) — этот вызов всегда возвращал 404. Либо нужно
  // реализовать этот эндпоинт на бэкенде (найти все устройства типа 'light'
  // в комнате и переключить каждое), либо убрать кнопку из UI, если фича
  // была задумана, но не доделана. Не стал молча чинить в одностороннем
  // порядке — решение зависит от того, действительно ли фича нужна.
  toggleLight: (roomId: string) =>
    request(`/rooms/${roomId}/light/toggle`, { method: 'POST' }),

  deviceOn: (id: string) =>
    request(`/devices/${id}/on`, { method: 'POST' }),

  deviceOff: (id: string) =>
    request(`/devices/${id}/off`, { method: 'POST' }),

  // НАХОДКА: /api/rooms/:id/override ТОЖЕ не существует на бэкенде. Та же
  // ситуация — нужно либо реализовать (временно заблокировать автоматику
  // для комнаты на N минут), либо убрать из UI.
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

  // НАХОДКА: /api/devices/discover ТОЖЕ не существует — но здесь есть рабочий
  // эквивалент под другим именем: POST /api/discovery/start (permit_join).
  // Это не "фича не доделана", а просто рассинхрон имён между фронтом и
  // бэкендом — почти наверняка баг, не забытая фича. Указываю правильный
  // путь ниже; если после проверки на реальном UI это ломает что-то ещё
  // (например, ответ имеет другую форму) — сверьте поля.
  discoverDevices: () =>
    request<{ ok: boolean; permit_join: boolean; discovered: any[]; reason?: string }>('/discovery/start', {
      method: 'POST',
    }),

  getAirQuality: () =>
    request<{ ok: boolean; air_quality: any[] }>('/air-quality'),

  getDashboardV2: () =>
    request<{ ok: boolean; metrics: any; energy_today: number; air_status: string; rooms: any[] }>('/dashboard/v2'),

  // НАХОДКА (Модуль 8, Находка 12): график энергопотребления в Dashboard.tsx
  // всегда рисовал захардкоженные FALLBACK_TREND — этот эндпоинт не вызывался
  // вообще. Бэкенд уже отдаёт корректные почасовые данные.
  getEnergyTrend: () =>
    request<{ ok: boolean; trend: { hour: string; power: number }[] }>('/energy/trend'),

  // ── Zigbee статус (донгл, MQTT, permit_join) ──
  getZigbeeStatus: () =>
    request<ZigbeeStatus>('/zigbee/status'),

  // ── Discovery status (permit_join + remaining) ──
  getDiscoveryStatus: () =>
    request<{ ok: boolean; permit_join: boolean; remaining: number }>('/discovery/status'),

  // ── House Mode ──
  getHouseMode: () =>
    request<{ ok: boolean; mode: string }>('/house-mode'),

  getHouseModes: () =>
    request<{ ok: boolean; modes: { name: string; display_name: string; icon: string | null }[] }>('/house-modes'),

  setHouseMode: (mode: string) =>
    request<{ ok: boolean; mode: string }>('/house-mode', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

  // ── Blueprints ──
  getBlueprints: () =>
    request<{ ok: boolean; blueprints: any[] }>('/scenarios/blueprints'),

  createFromBlueprint: (blueprintName: string) =>
    request<{ ok: boolean; scenario: any }>(`/scenarios/blueprints/${encodeURIComponent(blueprintName)}/create`, {
      method: 'POST',
    }),
};

export interface ZigbeeStatus {
  ok: boolean;
  mqtt_connected: boolean;
  permit_join: boolean;
  permit_join_time_left: number;
  devices_total: number;
  devices_online: number;
}
