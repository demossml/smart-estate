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
import { evaluateTelemetry, reloadScenarios } from './engine';

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
  { id: 100, name: 'Гостиная', icon: 'armchair' },
  { id: 101, name: 'Кухня', icon: 'cooking-pot' },
  { id: 102, name: 'Спальня', icon: 'bed' },
  { id: 103, name: 'Ванная', icon: 'bath' },
  { id: 104, name: 'Коридор', icon: 'door-open' },
  { id: 105, name: 'Улица', icon: 'tree-pine' },
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
    type: 'temp_sensor',
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
    type: 'temp_sensor',
    room: 'Кухня',
    properties: [
      { property: 'temperature', unit: '°C', min: 19, max: 30, current: 22.0, direction: 1 },
      { property: 'humidity', unit: '%', min: 40, max: 75, current: 55, direction: 1 },
    ],
  },
  {
    ieee_addr: 'demo:kitchen_air',
    name: 'Монитор воздуха',
    type: 'air_monitor',
    room: 'Кухня',
    properties: [
      { property: 'co2', unit: 'ppm', min: 400, max: 1200, current: 720, direction: 1 },
      { property: 'voc', unit: 'ppb', min: 0, max: 300, current: 110, direction: 1 },
      { property: 'pm25', unit: 'µg/m³', min: 0, max: 60, current: 18, direction: 1 },
      { property: 'formaldehyde', unit: 'mg/m³', min: 0, max: 0.1, current: 0.02, direction: -1 },
    ],
  },
  {
    ieee_addr: 'demo:kitchen_window',
    name: 'Окно левое',
    type: 'window_sensor',
    room: 'Кухня',
    properties: [
      { property: 'contact', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 },
    ],
  },
  {
    ieee_addr: 'demo:kitchen_fan',
    name: 'Вытяжка',
    type: 'fan',
    room: 'Кухня',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
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
    type: 'temp_sensor',
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
    type: 'temp_sensor',
    room: 'Ванная',
    properties: [
      { property: 'temperature', unit: '°C', min: 18, max: 28, current: 23.0, direction: 1 },
      { property: 'humidity', unit: '%', min: 45, max: 90, current: 65, direction: 1 },
    ],
  },
  {
    ieee_addr: 'demo:bath_leak',
    name: 'Датчик протечки',
    type: 'temp_sensor',
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
    type: 'temp_sensor',
    room: 'Коридор',
    properties: [
      { property: 'occupancy', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 },
      { property: 'illuminance', unit: 'lux', min: 0, max: 500, current: 120, direction: -1 },
    ],
  },
  {
    ieee_addr: 'demo:main_door',
    name: 'Входная дверь',
    type: 'temp_sensor',
    room: 'Коридор',
    properties: [{ property: 'contact', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
  },
  {
    ieee_addr: 'demo:main_lock',
    name: 'Замок двери',
    type: 'lock',
    room: 'Коридор',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
  },
  // Ворота и калитка
  {
    ieee_addr: 'demo:main_gate',
    name: 'Въездные ворота',
    type: 'gate',
    room: 'Улица',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
  },
  {
    ieee_addr: 'demo:side_gate',
    name: 'Калитка',
    type: 'gate',
    room: 'Улица',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
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
  // Clean up old data
  await query("DELETE FROM devices WHERE ieee_addr LIKE 'demo:%'");
  await query('DELETE FROM telemetry');

  // Rooms — find by name, create if missing, update icon, delete extras
  let roomCount = 0;
  const roomIdByName = new Map<string, number>();
  for (const r of DEMO_ROOMS) {
    const existing = await query('SELECT id, icon FROM rooms WHERE name = ?', r.name);
    if (existing.length > 0) {
      roomIdByName.set(r.name, Number(existing[0].id));
      // Update icon if changed
      if (existing[0].icon !== r.icon) {
        await query('UPDATE rooms SET icon = ? WHERE id = ?', r.icon, Number(existing[0].id));
      }
    } else {
      await query('INSERT INTO rooms (id, name, icon) VALUES (?, ?, ?)', r.id, r.name, r.icon);
      roomIdByName.set(r.name, r.id);
      roomCount++;
    }
  }
  // Delete rooms not in DEMO_ROOMS
  const demoIds = DEMO_ROOMS.map(r => r.id).join(',');
  const demoRoomIds = [...roomIdByName.values()].map(String);
  if (demoRoomIds.length) {
    await query(`DELETE FROM rooms WHERE id NOT IN (${demoRoomIds.join(',')})`);
  }
  let deviceCount = 0;
  for (const d of DEMO_DEVICES) {
    const roomId = roomIdByName.get(d.room) || null;
    await query(
      `INSERT INTO devices (ieee_addr, friendly_name, type, room_id, status, last_seen)
       VALUES (?, ?, ?, ?, 'online', CURRENT_TIMESTAMP)`,
      d.ieee_addr, d.name, d.type, roomId
    );
    deviceCount++;
  }

  // Init telemetry sequence
  const maxSeq = await query('SELECT COALESCE(MAX(id), 0) as mx FROM telemetry');
  _telemetrySeq = BigInt(maxSeq[0]?.mx || 100000) + BigInt(1);

  // Seed initial state=0 for gate/lock devices (so GatesCard sees them as closed)
  for (const d of DEMO_DEVICES) {
    if (d.type === 'gate' || d.type === 'lock') {
      const seq = _telemetrySeq++;
      await query(
        `INSERT INTO telemetry (id, device_ieee, property, value, unit, raw_json, ts)
         VALUES (${seq}, '${d.ieee_addr}', 'state', 0, 'bool', '{}', CURRENT_TIMESTAMP)`
      ).catch(() => {});
    }
  }

  // Init climate setpoints for temp sensors
  const tempSensors = DEMO_DEVICES.filter(d => d.properties.some(p => p.property === 'temperature'));
  for (const d of tempSensors) {
    const existing = await query('SELECT COUNT(*) as cnt FROM climate_setpoints WHERE device_ieee = ?', d.ieee_addr);
    if (Number(existing[0]?.cnt || 0) === 0) {
      await query(
        `INSERT INTO climate_setpoints (device_ieee, target_temp, mode, hysteresis, min_temp, max_temp)
         VALUES (?, 22, 'auto', 1, 16, 30)`,
        d.ieee_addr
      );
    }
  }

  // Seed demo scenarios for air quality → ventilation
  await query("DELETE FROM scenario_executions");
  await query("DELETE FROM scenarios WHERE name LIKE 'Демо:%'");
  const maxScId = await query('SELECT COALESCE(MAX(id), 0) as mx FROM scenarios');
  let nextScId = Number(maxScId[0]?.mx || 0) + 1;
  await query(`INSERT INTO scenarios (id, name, triggers_json, actions_json, active)
    VALUES (?, 'Демо: Плохой воздух → вентиляция',
      '{"logic":"ANY","conditions":[{"device":"demo:kitchen_air","property":"co2","operator":">","value":800},{"device":"demo:kitchen_air","property":"voc","operator":">","value":200},{"device":"demo:kitchen_air","property":"pm25","operator":">","value":35}]}',
      '[{"type":"mqtt","device":"demo:kitchen_fan","command":"ON","payload":{}}]',
      true)`, nextScId++);
  await query(`INSERT INTO scenarios (id, name, triggers_json, actions_json, active)
    VALUES (?, 'Демо: Воздух чистый → вентиляция OFF',
      '{"logic":"ALL","conditions":[{"device":"demo:kitchen_air","property":"co2","operator":"<","value":500},{"device":"demo:kitchen_air","property":"voc","operator":"<","value":60},{"device":"demo:kitchen_air","property":"pm25","operator":"<","value":12}]}',
      '[{"type":"mqtt","device":"demo:kitchen_fan","command":"OFF","payload":{}}]',
      true)`, nextScId++);
  await reloadScenarios();

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
export async function stopDemo(): Promise<void> {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  _isDemoActive = false;
  // Clean up demo telemetry so real devices show clearly
  try {
    await query(`DELETE FROM telemetry WHERE device_ieee LIKE 'demo:%'`);
    await query(`DELETE FROM state_changes WHERE device_ieee LIKE 'demo:%'`);
    console.log('🧹 DEMO MODE: телеметрия demo-устройств очищена');
  } catch (e: any) {
    console.error('🧹 DEMO cleanup error:', e.message);
  }
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

    // Write telemetry so frontend sees state change immediately
    const seq = _telemetrySeq++;
    query(
      `INSERT INTO telemetry (id, device_ieee, property, value, unit, raw_json, ts)
       VALUES (${seq}, '${ieee_addr}', 'state', ${newVal}, 'bool', '{}', CURRENT_TIMESTAMP)`
    ).catch(() => {});
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
      // Skip boolean state/contact — these are events, not metrics
      if (prop.property === 'contact') continue;
      if (prop.property === 'state') continue;

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

  // Evaluate scenarios after telemetry update (demo mode)
  const scenarioDevices = new Map<string, Record<string, number>>();
  for (const device of DEMO_DEVICES) {
    const props: Record<string, number> = {};
    for (const prop of device.properties) {
      if (prop.property === 'state' || prop.property === 'contact') continue;
      props[prop.property] = prop.current;
    }
    if (Object.keys(props).length > 0) {
      scenarioDevices.set(device.ieee_addr, props);
    }
  }
  for (const [ieee, props] of scenarioDevices) {
    await evaluateTelemetry(ieee, props).catch(() => {});
  }

  // Apply scenario-driven commands to demo device state by checking scenario_executions
  const recentExecs = await query(
    `SELECT se.*, s.name as scenario_name, s.actions_json FROM scenario_executions se
     JOIN scenarios s ON s.id = se.scenario_id
     WHERE se.ts >= CURRENT_TIMESTAMP - INTERVAL '10 seconds'
       AND s.name LIKE 'Демо:%'
     ORDER BY se.ts DESC LIMIT 5`
  ).catch(() => []);
  for (const exec of recentExecs || []) {
    try {
      const actions = JSON.parse(exec.actions_json || '[]');
      for (const action of actions) {
        if (action.type === 'mqtt' && action.device) {
          const dev = DEMO_DEVICES.find(d => d.ieee_addr === action.device);
          if (!dev) continue;
          const stateProp = dev.properties.find(p => p.property === 'state');
          if (stateProp) {
            const newState = action.command === 'ON' ? 1 : 0;
            if (stateProp.current !== newState) {
              stateProp.current = newState;
            }
          }
        }
      }
    } catch {}
  }

  // Write fan state to telemetry so frontend sees scenario-driven changes
  const fan = DEMO_DEVICES.find(d => d.ieee_addr === 'demo:kitchen_fan');
  if (fan) {
    const stateProp = fan.properties.find(p => p.property === 'state');
    if (stateProp) {
      const seq = _telemetrySeq++;
      await query(
        `INSERT INTO telemetry (id, device_ieee, property, value, unit, raw_json, ts)
         VALUES (${seq}, 'demo:kitchen_fan', 'state', ${stateProp.current}, 'bool', '{}', '${now}')`
      );
    }
  }
}
