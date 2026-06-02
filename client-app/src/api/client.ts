const BASE = '/api';

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
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function unwrap<T>(promise: Promise<T | { ok: boolean }>): Promise<T> {
  const data = await promise;
  if (data && typeof data === 'object' && 'ok' in data) {
    return data as T;
  }
  return data as T;
}

export const api = {
  getStatus: () => request<import('../types').ServerStatus>('/status'),
  getDashboard: () => unwrap<import('../types').DashboardData>(request('/dashboard')),
  getDevices: () => request<import('../types').Device[]>('/devices'),
  getScenarios: () => request<import('../types').Scenario[]>('/scenarios'),
  getClimate: () => request<import('../types').ClimateSetpoint[]>('/climate'),
  updateClimate: (id: string, targetTemp: number, mode: import('../types').ClimateSetpoint['mode']) =>
    request(`/climate/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ targetTemp, mode }),
    }),
  getGates: () => request<import('../types').Gate[]>('/gates'),
  openGate: (id: string) => request(`/gates/${id}/open`, { method: 'POST' }),
  closeGate: (id: string) => request(`/gates/${id}/close`, { method: 'POST' }),
  getEvents: () => request<import('../types').EstateEvent[]>('/events'),
  sendClientLogs: (logs: unknown[]) =>
    request('/client-logs', {
      method: 'POST',
      body: JSON.stringify({ logs }),
    }),
  toggleLight: (roomId: string) => request(`/rooms/${roomId}/light/toggle`, { method: 'POST' }),
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
};
