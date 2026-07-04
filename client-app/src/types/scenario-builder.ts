// ── Condition types ──────────────────────────────────

export interface DeviceCondition {
  type: 'device';
  device: string;       // ieee_addr
  property: string;
  operator: string;     // > < >= <= = !=
  value: number;
}

export interface TimeCondition {
  type: 'time';
  kind: 'sunset' | 'sunrise' | 'time' | 'cron';
  offsetMinutes?: number;  // e.g. -30 for "30 min before sunset"
  timeStr?: string;        // e.g. "22:00" for kind='time'
  cronExpr?: string;       // e.g. "0 22 * * *" for kind='cron'
}

export interface StateCondition {
  type: 'state';
  device: string;
  expectedState: string;  // 'open' | 'closed' | 'on' | 'off'
}

export type Condition = DeviceCondition | TimeCondition | StateCondition;

// ── Action types ─────────────────────────────────────

export interface DeviceAction {
  type: 'device';
  device: string;
  command: string;       // ON | OFF | OPEN | CLOSE
  brightness?: number;   // 0-100 for dimmable lights
}

export interface GroupAction {
  type: 'group';
  roomId: string;
  deviceType: string;    // light | plug | gate | lock
  command: string;
}

export interface DelayAction {
  type: 'delay';
  seconds: number;
}

export interface ScenarioAction {
  type: 'scenario';
  scenarioId: string;
  enable: boolean;       // true = activate, false = deactivate
}

export type Action = DeviceAction | GroupAction | DelayAction | ScenarioAction;

// ── Builder state ────────────────────────────────────

export interface BuilderState {
  name: string;
  logic: 'ANY' | 'ALL';
  conditions: Condition[];
  actions: Action[];
}

export const EMPTY_BUILDER: BuilderState = {
  name: '',
  logic: 'ANY',
  conditions: [],
  actions: [],
};

// ── Helpers ──────────────────────────────────────────

export const OPS = ['>', '<', '>=', '<=', '=', '!='];
export const PROP_OPTIONS = ['temperature', 'humidity', 'co2', 'voc', 'pm25', 'formaldehyde', 'occupancy', 'illuminance', 'contact', 'water_leak'];

export const PROP_LABELS: Record<string, string> = {
  temperature: 'Температура °C', humidity: 'Влажность %', co2: 'CO₂ ppm',
  voc: 'VOC ppb', pm25: 'PM2.5', formaldehyde: 'CH₂O',
  occupancy: 'Движение', illuminance: 'Освещённость',
  contact: 'Открытие', water_leak: 'Протечка',
};

export const TIME_KINDS = [
  { value: 'sunset', label: 'Закат' },
  { value: 'sunrise', label: 'Рассвет' },
  { value: 'time', label: 'Время' },
  { value: 'cron', label: 'Cron' },
] as const;
