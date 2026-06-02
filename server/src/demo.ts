/**
 * demo.ts — Демо-режим: симуляция датчиков умного дома
 *
 * Не трогает существующий код. Добавляет слой симуляции данных
 * для тестирования фронтенда без реального железа.
 *
 * Подключается опционально: если переменная SMART_ESTATE_MODE=demo
 * ИЛИ через API: POST /api/mode { "mode": "demo" }
 */

import { query, logStateChange, logCommand } from './db';

// ── Types ─────────────────────────────────────────────
interface DemoDevice {
  ieee_addr: string;
  name: string;
  type: string;
  room: string;
  properties: DemoProperty[];
}

interface DemoProperty {
  property: string;
  unit: string;
  min: number;
  max: number;
  /** Текущее значение (обновляется симулятором) */
  current: number;
  /** Направление изменения для плавности */
  direction: number;
}

// ── State ─────────────────────────────────────────────
let intervalId: ReturnType<typeof setInterval> | null = null;
let _isDemoActive = false;
let _telemetrySeq = BigInt(100000);

// ═══════════════════════════════════════════════════════
// DEMO DEVICES — полный набор датчиков
// ═══════════════════════════════════════════════════════

const DEMO_ROOMS = [
  { id: 100, name: 'Гостиная', icon: '🛋️' },
  { id: 101, name: 'Кухня', icon: '🍳' },
  { id: 102, name: 'Спальня', icon: '🛏️' },
  { id: 103, name: 'Ванная', icon: '🛁' },
  { id: 104, name: 'Коридор', icon: '🚪' },
];

const DEMO_DEVICES: DemoDevice[] = [
  // Гостиная
  {
    ieee_addr: 'demo:living_light',
    name: 'Основной свет',
    type: 'light',
    room: 'Гостиная',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 1, direction: 0 }],
  },
  {
    ieee_addr: 'demo:living_temp',
    name: 'Датчик температуры',
    type: 'sensor',
    room: 'Гостиная',
    properties: [
      { property: 'temperature', unit: '°C', min: 18, max: 28, current: 21.5, direction: 1 },
      { property: 'humidity', unit: '%', min: 35, max: 65, current: 48, direction: -1 },
    ],
  },
  {
    ieee_addr: 'demo:living_power',
    name: 'Розетка ТВ',
    type: 'plug',
    room: 'Гостиная',
    properties: [{ property: 'power', unit: 'W', min: 5, max: 150, current: 45, direction: 1 }],
  },

  // Кухня
  {
    ieee_addr: 'demo:kitchen_light',
    name: 'Свет кухни',
    type: 'light',
    room: 'Кухня',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
  },
  {
    ieee_addr: 'demo:kitchen_temp',
    name: 'Датчик температуры',
    type: 'sensor',
    room: 'Кухня',
    properties: [
      { property: 'temperature', unit: '°C', min: 19, max: 30, current: 22.0, direction: 1 },
      { property: 'humidity', unit: '%', min: 40, max: 75, current: 55, direction: 1 },
      { property: 'co2', unit: 'ppm', min: 400, max: 1200, current: 680, direction: 1 },
    ],
  },
  {
    ieee_addr: 'demo:kitchen_fridge',
    name: 'Холодильник',
    type: 'plug',
    room: 'Кухня',
    properties: [{ property: 'power', unit: 'W', min: 50, max: 200, current: 120, direction: -1 }],
  },

  // Спальня
  {
    ieee_addr: 'demo:bedroom_light',
    name: 'Свет спальни',
    type: 'light',
    room: 'Спальня',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
  },
  {
    ieee_addr: 'demo:bedroom_temp',
    name: 'Датчик температуры',
    type: 'sensor',
    room: 'Спальня',
    properties: [
      { property: 'temperature', unit: '°C', min: 18, max: 26, current: 20.0, direction: -1 },
      { property: 'humidity', unit: '%', min: 40, max: 60, current: 52, direction: -1 },
    ],
  },

  // Ванная
  {
    ieee_addr: 'demo:bath_light',
    name: 'Свет ванной',
    type: 'light',
    room: 'Ванная',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
  },
  {
    ieee_addr: 'demo:bath_temp',
    name: 'Датчик влажности',
    type: 'sensor',
    room: 'Ванная',
    properties: [
      { property: 'temperature', unit: '°C', min: 18, max: 28, current: 23.0, direction: 1 },
      { property: 'humidity', unit: '%', min: 45, max: 90, current: 65, direction: 1 },
    ],
  },
  {
    ieee_addr: 'demo:bath_leak',
    name: 'Датчик протечки',
    type: 'sensor',
    room: 'Ванная',
    properties: [{ property: 'water_leak', unit: 'bool', min: 0, max: 0, current: 0, direction: 0 }],
  },

  // Коридор
  {
    ieee_addr: 'demo:hall_light',
    name: 'Свет коридора',
    type: 'light',
    room: 'Коридор',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 1, direction: 0 }],
  },
  {
    ieee_addr: 'demo:hall_motion',
    name: 'Датчик движения',
    type: 'sensor',
    room: 'Коридор',
    properties: [
      { property: 'occupancy', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 },
      { property: 'illuminance', unit: 'lux', min: 0, max: 500, current: 120, direction: -1 },
    ],
  },
  {
    ieee_addr: 'demo:main_door',
    name: 'Входная дверь',
    type: 'sensor',
    room: 'Коридор',
    properties: [{ property: 'contact', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
  },
];

// ═══════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════

export function isDemoMode(): boolean {
  return _isDemoActive;
}

/**
 * Seed demo data into the database.
 * Only inserts if rooms/devices don't already exist.
 */
export async function seedDemoData(): Promise<{ rooms: number; devices: number }> {
  // Rooms
  let roomCount = 0;
  for (const r of DEMO_ROOMS) {
    const existing = await query('SELECT COUNT(*) as cnt FROM rooms WHERE id = ?', r.id);
    if (existing[0]?.cnt === 0) {
      await query('INSERT INTO rooms (id, name, icon) VALUES (?, ?, ?)', r.id, r.name, r.icon);
      roomCount++;
    }
  }

  // Devices
  let deviceCount = 0;
  for (const d of DEMO_DEVICES) {
    const existing = await query('SELECT COUNT(*) as cnt FROM devices WHERE ieee_addr = ?', d.ieee_addr);
    if (existing[0]?.cnt === 0) {
      const room = DEMO_ROOMS.find(r => r.name === d.room);
      await query(
        `INSERT INTO devices (ieee_addr, friendly_name, type, room_id, status, last_seen)
         VALUES (?, ?, ?, ?, 'online', CURRENT_TIMESTAMP)`,
        d.ieee_addr, d.name, d.type, room?.id || null
      );
      deviceCount++;
    }
  }

  // Init telemetry sequence
  const maxSeq = await query('SELECT COALESCE(MAX(id), 0) as mx FROM telemetry');
  _telemetrySeq = BigInt(maxSeq[0]?.mx || 100000) + BigInt(1);

  console.log(`🌱 Demo seed: ${roomCount} rooms, ${deviceCount} devices`);
  return { rooms: roomCount, devices: deviceCount };
}

/**
 * Start the demo simulator.
 * Seeds data, then runs every 3 seconds to generate telemetry.
 */
export async function startDemo(): Promise<void> {
  if (_isDemoActive) return;
  await seedDemoData();

  _isDemoActive = true;
  console.log('🎭 DEMO MODE: симуляция датчиков активна (каждые 3 сек)');

  // Generate first batch immediately
  await generateTelemetry();

  // Then every 3 seconds
  intervalId = setInterval(generateTelemetry, 3000);
}

/**
 * Stop the demo simulator.
 */
export function stopDemo(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  _isDemoActive = false;
  console.log('🎭 DEMO MODE: остановлен');
}

/**
 * Toggle a device state (for manual control in demo mode).
 */
export async function toggleDemoDevice(ieee_addr: string, state: 'ON' | 'OFF'): Promise<boolean> {
  const dev = DEMO_DEVICES.find(d => d.ieee_addr === ieee_addr);
  if (!dev) return false;

  const stateProp = dev.properties.find(p => p.property === 'state');
  if (stateProp) {
    const newVal = state === 'ON' ? 1 : 0;
    stateProp.current = newVal;

    // Log to DB
    logCommand(ieee_addr, state, '{}', 'demo');
    logStateChange(ieee_addr, state === 'ON' ? 'OFF' : 'ON', state, 'demo_toggle');
  }

  return true;
}

// ═══════════════════════════════════════════════════════
// INTERNAL: Telemetry Generator
// ═══════════════════════════════════════════════════════

async function generateTelemetry(): Promise<void> {
  const now = new Date().toISOString();
  const batch: string[] = [];

  for (const device of DEMO_DEVICES) {
    for (const prop of device.properties) {
      // Skip boolean state — only interesting for lights
      if (prop.property === 'state' || prop.property === 'contact') continue;

      // Update value with smooth random walk
      const step = (Math.random() - 0.5) * (prop.max - prop.min) * 0.05;
      prop.current += step;

      // Bounce off bounds
      if (prop.current >= prop.max) { prop.current = prop.max - 0.1; prop.direction = -1; }
      if (prop.current <= prop.min) { prop.current = prop.min + 0.1; prop.direction = 1; }

      // Add some noise
      prop.current += (Math.random() - 0.5) * 0.15;
      prop.current = +prop.current.toFixed(2);

      // Special: motion sensor occasionally triggers
      if (prop.property === 'occupancy') {
        prop.current = Math.random() < 0.15 ? 1 : 0;
      }

      // Special: water leak always 0 (safe)
      if (prop.property === 'water_leak') {
        prop.current = 0;
      }

      // Special: illuminance follows day cycle (approximate, UTC+8)
      const hourUTC = new Date().getUTCHours();
      const localHour = (hourUTC + 8) % 24;
      if (prop.property === 'illuminance') {
        const dayFactor = Math.sin((localHour - 6) / 24 * Math.PI);
        prop.current = Math.max(0, Math.min(500, dayFactor * 400 + Math.random() * 50));
        prop.current = +prop.current.toFixed(0);
      }

      const seq = _telemetrySeq++;
      batch.push(
        `(${seq}, '${device.ieee_addr}', '${prop.property}', ${prop.current}, '${prop.unit}', '{}', '${now}')`
      );
    }
  }

  // Bulk insert for performance
  if (batch.length > 0) {
    try {
      await query(
        `INSERT INTO telemetry (id, device_ieee, property, value, unit, raw_json, ts) VALUES ${batch.join(', ')}`
      );
    } catch {
      // Ignore insert errors (e.g. if sequence collides)
    }
  }
}
