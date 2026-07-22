/**
 * demo.ts — Демо-режим: симуляция датчиков умного дома
 *
 * Не трогает существующий код. Добавляет слой симуляции данных
 * для тестирования фронтенда без реального железа.
 *
 * Подключается опционально: если переменная SMART_ESTATE_MODE=demo
 * ИЛИ через API: POST /api/mode { "mode": "demo" }
 */

import { query, logStateChange, logCommand, logErrorWithLog } from './db';
import { evaluateTelemetry, reloadScenarios } from './engine';
import logger from './logger';

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
  { id: 100, name: 'Гостиная (демо)', icon: 'armchair' },
  { id: 101, name: 'Кухня (демо)', icon: 'cooking-pot' },
  { id: 102, name: 'Спальня (демо)', icon: 'bed' },
  { id: 103, name: 'Ванная (демо)', icon: 'bath' },
  { id: 104, name: 'Коридор (демо)', icon: 'door-open' },
  { id: 105, name: 'Улица (демо)', icon: 'tree-pine' },
];

const DEMO_DEVICES: DemoDevice[] = [
  // Гостиная
  {
    ieee_addr: 'demo:living_light',
    name: 'Основной свет',
    type: 'light',
    room: 'Гостиная (демо)',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 1, direction: 0 }],
  },
  {
    ieee_addr: 'demo:living_temp',
    name: 'Датчик температуры',
    type: 'sensor',
    room: 'Гостиная (демо)',
    properties: [
      { property: 'temperature', unit: '°C', min: 18, max: 28, current: 21.5, direction: 1 },
      { property: 'humidity', unit: '%', min: 35, max: 65, current: 48, direction: -1 },
    ],
  },
  {
    ieee_addr: 'demo:living_power',
    name: 'Розетка ТВ',
    type: 'plug',
    room: 'Гостиная (демо)',
    properties: [{ property: 'power', unit: 'W', min: 5, max: 150, current: 45, direction: 1 }],
  },

  // Кухня
  {
    ieee_addr: 'demo:kitchen_light',
    name: 'Свет кухни',
    type: 'light',
    room: 'Кухня (демо)',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
  },
  {
    ieee_addr: 'demo:kitchen_temp',
    name: 'Датчик температуры',
    type: 'sensor',
    room: 'Кухня (демо)',
    properties: [
      { property: 'temperature', unit: '°C', min: 19, max: 30, current: 22.0, direction: 1 },
      { property: 'humidity', unit: '%', min: 40, max: 75, current: 55, direction: 1 },
    ],
  },
  {
    ieee_addr: 'demo:kitchen_air',
    name: 'Монитор воздуха',
    type: 'air_monitor',
    room: 'Кухня (демо)',
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
    room: 'Кухня (демо)',
    properties: [
      { property: 'contact', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 },
    ],
  },
  {
    // НАХОДКА (Модуль 5): type был 'fan' — это не значение, которое реальный
    // классификатор (mapZ2MTypeToInternal) может присвоить устройству. Вытяжка
    // управляется как реле on/off, ближе всего к 'plug' в текущей таксономии.
    ieee_addr: 'demo:kitchen_fan',
    name: 'Вытяжка',
    type: 'plug',
    room: 'Кухня (демо)',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
  },
  {
    ieee_addr: 'demo:kitchen_fridge',
    name: 'Холодильник',
    type: 'plug',
    room: 'Кухня (демо)',
    properties: [{ property: 'power', unit: 'W', min: 50, max: 200, current: 120, direction: -1 }],
  },

  // Спальня
  {
    ieee_addr: 'demo:bedroom_light',
    name: 'Свет спальни',
    type: 'light',
    room: 'Спальня (демо)',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
  },
  {
    ieee_addr: 'demo:bedroom_temp',
    name: 'Датчик температуры',
    type: 'sensor',
    room: 'Спальня (демо)',
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
    room: 'Ванная (демо)',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
  },
  {
    ieee_addr: 'demo:bath_temp',
    name: 'Датчик влажности',
    type: 'sensor',
    room: 'Ванная (демо)',
    properties: [
      { property: 'temperature', unit: '°C', min: 18, max: 28, current: 23.0, direction: 1 },
      { property: 'humidity', unit: '%', min: 45, max: 90, current: 65, direction: 1 },
    ],
  },
  {
    // НАХОДКА (Модуль 5): type был 'temp_sensor' — явный копипаст, это датчик
    // протечки, не температуры. Правильный тип — 'leak_sensor'.
    ieee_addr: 'demo:bath_leak',
    name: 'Датчик протечки',
    type: 'leak_sensor',
    room: 'Ванная (демо)',
    properties: [{ property: 'water_leak', unit: 'bool', min: 0, max: 0, current: 0, direction: 0 }],
  },

  // Коридор
  {
    ieee_addr: 'demo:hall_light',
    name: 'Свет коридора',
    type: 'light',
    room: 'Коридор (демо)',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 1, direction: 0 }],
  },
  {
    // НАХОДКА (Модуль 5): type был 'temp_sensor' — тоже копипаст, устройство
    // сообщает occupancy/illuminance, это датчик движения, не температуры.
    ieee_addr: 'demo:hall_motion',
    name: 'Датчик движения',
    type: 'motion_sensor',
    room: 'Коридор (демо)',
    properties: [
      { property: 'occupancy', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 },
      { property: 'illuminance', unit: 'lux', min: 0, max: 500, current: 120, direction: -1 },
    ],
  },
  {
    // НАХОДКА (Модуль 5): type был 'temp_sensor' — тоже копипаст, это контакт
    // входной двери, правильный тип — 'door_sensor'.
    ieee_addr: 'demo:main_door',
    name: 'Входная дверь',
    type: 'door_sensor',
    room: 'Коридор (демо)',
    properties: [{ property: 'contact', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
  },
  {
    ieee_addr: 'demo:main_lock',
    name: 'Замок двери',
    type: 'lock',
    room: 'Коридор (демо)',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
  },
  // Ворота и калитка
  // НАХОДКА (при чтении Модуля 5, связано с Модулем 3): тип 'gate' здесь и
  // в валидаторе ручного создания устройства (api.ts) есть, но реальный
  // авто-классификатор mapZ2MTypeToInternal (mqtt-ws.ts) никогда не выдаёт
  // 'gate' — только light/shutter/lock/plug/climate/sensor/*_sensor/air_monitor.
  // Это значит настоящее реле ворот, будучи распознанным автоматически,
  // получит type='plug', а не 'gate', и не попадёт на страницу "Ворота"
  // (там фильтр WHERE type IN ('gate','lock')) без ручной правки пользователем.
  // Не чиню здесь — это отдельный вопрос о том, какие типы actuator'ов вообще
  // должны существовать в классификаторе (см. PATCH_INSTRUCTIONS.md, Модуль 3).
  {
    ieee_addr: 'demo:main_gate',
    name: 'Въездные ворота',
    type: 'gate',
    room: 'Улица (демо)',
    properties: [{ property: 'state', unit: 'bool', min: 0, max: 1, current: 0, direction: 0 }],
  },
  {
    ieee_addr: 'demo:side_gate',
    name: 'Калитка',
    type: 'gate',
    room: 'Улица (демо)',
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
  await query("DELETE FROM devices WHERE is_demo = 1");
  await query("DELETE FROM devices WHERE ieee_addr LIKE 'demo:%'");
  await query("DELETE FROM telemetry WHERE device_ieee LIKE 'demo:%'");

  let roomCount = 0;
  const roomIdByName = new Map<string, number>();
  for (const r of DEMO_ROOMS) {
    await query(
      'INSERT OR IGNORE INTO rooms (id, name, icon, is_demo) VALUES (?, ?, ?, 1)',
      r.id, r.name, r.icon
    );
    roomIdByName.set(r.name, r.id);
    roomCount++;
  }

  let deviceCount = 0;
  for (const d of DEMO_DEVICES) {
    const roomId = roomIdByName.get(d.room) || null;
    await query(
      `INSERT INTO devices (ieee_addr, friendly_name, type, room_id, status, last_seen, is_demo)
       VALUES (?, ?, ?, ?, 'online', CURRENT_TIMESTAMP, 1)`,
      d.ieee_addr, d.name, d.type, roomId
    );
    deviceCount++;
  }

  const maxSeq = await query('SELECT COALESCE(MAX(id), 0) as mx FROM telemetry');
  _telemetrySeq = BigInt(maxSeq[0]?.mx || 100000) + BigInt(1);

  // Seed initial state=0 for gate/lock devices (so GatesCard sees them as closed)
  // НАХОДКА: раньше строился сырой SQL с интерполяцией ${d.ieee_addr} прямо в
  // строку запроса. Здесь конкретно ieee_addr берётся из хардкодного массива
  // DEMO_DEVICES (не пользовательский ввод), поэтому не эксплуатируется, но
  // это плохой паттерн — параметризовано для консистентности с остальным кодом.
  for (const d of DEMO_DEVICES) {
    if (d.type === 'gate' || d.type === 'lock') {
      const seq = _telemetrySeq++;
      await query(
        `INSERT INTO telemetry (id, device_ieee, property, value, unit, raw_json, ts)
         VALUES (?, ?, 'state', 0, 'bool', '{}', CURRENT_TIMESTAMP)`,
        seq.toString(), d.ieee_addr
      ).catch(() => {});
    }
  }

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

  logger.log("[DEMO] ", `🌱 Demo seed: ${roomCount} rooms, ${deviceCount} devices`);
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
  logger.log("[DEMO] ", '🎭 DEMO MODE: симуляция датчиков активна (каждые 3 сек)');

  await generateTelemetry();
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
  try {
    await query(`DELETE FROM commands WHERE device_ieee LIKE 'demo:%' OR device_ieee IN (SELECT ieee_addr FROM devices WHERE is_demo = 1)`);
    await query(`DELETE FROM errors WHERE device_ieee LIKE 'demo:%' OR device_ieee IN (SELECT ieee_addr FROM devices WHERE is_demo = 1)`);
    await query(`DELETE FROM climate_setpoints WHERE device_ieee LIKE 'demo:%' OR device_ieee IN (SELECT ieee_addr FROM devices WHERE is_demo = 1)`);
    await query(`DELETE FROM device_group_members WHERE device_ieee LIKE 'demo:%' OR device_ieee IN (SELECT ieee_addr FROM devices WHERE is_demo = 1)`);
    await query(`DELETE FROM state_changes WHERE device_ieee LIKE 'demo:%' OR device_ieee IN (SELECT ieee_addr FROM devices WHERE is_demo = 1)`);
    await query(`DELETE FROM telemetry WHERE device_ieee LIKE 'demo:%'`);
    await query(`DELETE FROM devices WHERE is_demo = 1`);
    await query(`DELETE FROM devices WHERE ieee_addr LIKE 'demo:%'`);
    await query(`DELETE FROM rooms WHERE id >= 100 OR is_demo = 1`);
    await query(`DELETE FROM scenario_executions WHERE scenario_id IN (SELECT id FROM scenarios WHERE name LIKE 'Демо:%')`);
    await query(`DELETE FROM scenarios WHERE name LIKE 'Демо:%'`);
    logger.log("[DEMO] ", '🧹 DEMO MODE: все демо-данные очищены');
  } catch (e: any) {
    logger.error("[DEMO] ", '🧹 DEMO cleanup error:', e.message);
  }
  logger.log("[DEMO] ", '🎭 DEMO MODE: остановлен');
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

    await logCommand(ieee_addr, state, '{}', 'demo');
    await logStateChange(ieee_addr, state === 'ON' ? 'OFF' : 'ON', state, 'demo_toggle');

    // НАХОДКА (СЕРЬЁЗНАЯ): раньше здесь была прямая интерполяция строки —
    // `VALUES (${seq}, '${ieee_addr}', ...)` — а ieee_addr приходит из
    // req.params.id (POST /api/devices/:id/on, /api/gates/:id/open и т.п.),
    // то есть из URL, под контролем вызывающего. Это реальная SQL-инъекция,
    // пусть и ограниченная демо-режимом. Теперь — параметризованный запрос.
    const seq = _telemetrySeq++;
    await query(
      `INSERT INTO telemetry (id, device_ieee, property, value, unit, raw_json, ts)
       VALUES (?, ?, 'state', ?, 'bool', '{}', CURRENT_TIMESTAMP)`,
      seq.toString(), ieee_addr, newVal
    );
  }

  return true;
}

// ═══════════════════════════════════════════════════════
// INTERNAL: Telemetry Generator
// ═══════════════════════════════════════════════════════

async function generateTelemetry(): Promise<void> {
  const now = new Date().toISOString();
  const rows: Array<[string, string, string, number, string, string, string]> = [];

  for (const device of DEMO_DEVICES) {
    for (const prop of device.properties) {
      if (prop.property === 'contact') continue;
      if (prop.property === 'state') continue;

      const step = (Math.random() - 0.5) * (prop.max - prop.min) * 0.05;
      prop.current += step;

      if (prop.current >= prop.max) { prop.current = prop.max - 0.1; prop.direction = -1; }
      if (prop.current <= prop.min) { prop.current = prop.min + 0.1; prop.direction = 1; }

      prop.current += (Math.random() - 0.5) * 0.15;
      prop.current = +prop.current.toFixed(2);

      if (prop.property === 'occupancy') {
        prop.current = Math.random() < 0.15 ? 1 : 0;
      }

      if (prop.property === 'water_leak') {
        prop.current = 0;
      }

      const hourUTC = new Date().getUTCHours();
      const localHour = (hourUTC + 8) % 24;
      if (prop.property === 'illuminance') {
        const dayFactor = Math.sin((localHour - 6) / 24 * Math.PI);
        prop.current = Math.max(0, Math.min(500, dayFactor * 400 + Math.random() * 50));
        prop.current = +prop.current.toFixed(0);
      }

      const seq = _telemetrySeq++;
      rows.push([seq.toString(), device.ieee_addr, prop.property, prop.current, prop.unit, '{}', now]);
    }
  }

  // Bulk insert — параметризованный (было: сборка строки через интерполяцию;
  // данные здесь не пользовательские, но параметризация дешёвая и убирает
  // соблазн скопировать этот паттерн в контекст, где вход внешний).
  if (rows.length > 0) {
    try {
      const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
      const flatParams = rows.flat();
      await query(
        `INSERT INTO telemetry (id, device_ieee, property, value, unit, raw_json, ts) VALUES ${placeholders}`,
        ...flatParams
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

  // Apply scenario-driven commands to demo device state by checking scenario_executions.
  //
  // НАХОДКА (архитектурная, для сведения — не исправлял без обсуждения):
  // это ВТОРОЙ, независимый механизм применения действий сценария к демо-
  // устройствам, отдельный от executeActions()/publishCommand() (Модуль 3).
  // Он существует, видимо, потому что publishCommand() не может ничего
  // "включить" для демо-устройств — они не подключены к реальному MQTT.
  // Побочный эффект после фикса Модуля 3: executeMqttAction теперь честно
  // логирует ошибку "MQTT not connected" при каждом срабатывании демо-сценария
  // (т.к. в демо-режиме MQTT-клиент реально не подключен) — сама демо-логика
  // при этом продолжает работать через этот отдельный путь ниже, ошибка не
  // мешает функциональности, но будет шуметь в логах/errors во время демо.
  // Если это нежелательно — можно проверять isDemoMode() в executeMqttAction
  // и не логировать ошибку в этом случае, но это отдельное решение, не стал
  // принимать его в одностороннем порядке.
  const recentExecs = await query(
    `SELECT se.*, s.name as scenario_name, s.actions_json FROM scenario_executions se
     JOIN scenarios s ON s.id = se.scenario_id
     WHERE se.ts >= datetime('now', '-10 seconds')
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
         VALUES (?, 'demo:kitchen_fan', 'state', ?, 'bool', '{}', ?)`,
        seq.toString(), stateProp.current, now
      );
    }
  }
}
