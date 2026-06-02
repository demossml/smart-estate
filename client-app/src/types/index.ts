/** Room data from API */
export interface Room {
  id: string;
  name: string;
  icon: string;        // emoji or icon name
  temperature?: number;
  humidity?: number;
  power?: number;       // current watts
  lightOn?: boolean;
  status: 'auto' | 'override' | 'error';
  overrideUntil?: string; // ISO timestamp
  nextEvent?: string;
}

/** Device from API */
export interface Device {
  id: string;
  name: string;
  type: string;
  room: string;
  online: boolean;
  rssi?: number;
  power?: number;
}

/** Security status */
export interface SecurityStatus {
  armed: boolean;
  openPoints: string[];  // open doors/windows
}

/** Scenario */
export interface Scenario {
  id: string;
  name: string;
  trigger: string;
  condition?: string;
  actions: string[];
  active: boolean;
}

/** Climate thermostat/setpoint */
export interface ClimateSetpoint {
  id: string;
  name: string;
  room: string;
  currentTemp: number;
  targetTemp: number;
  mode: 'heat' | 'cool' | 'auto' | 'off';
  online: boolean;
}

/** Gate or lock device */
export interface Gate {
  id: string;
  name: string;
  status: 'open' | 'closed' | 'moving' | 'error';
  online: boolean;
  lastAction?: string;
}

/** Event feed item */
export interface EstateEvent {
  id: string;
  type: 'command' | 'error' | 'state' | 'security' | 'scenario';
  title: string;
  details?: string;
  ts: string;
}

/** Dashboard data */
export interface DashboardData {
  autoActive: boolean;
  nextEvent: string;
  security: SecurityStatus;
  rooms: Room[];
  todayEnergy: number;  // kWh
  energyTrend: number[]; // last 24h
}

export interface ServerStatus {
  ok: boolean;
  devices?: { total: number; online?: number; offline?: number };
  errors?: number;
  mode?: 'live' | 'demo';
}
