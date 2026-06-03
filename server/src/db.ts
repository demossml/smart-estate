import * as duckdb from 'duckdb';
import * as path from 'path';

const DB_PATH = process.env.SMART_ESTATE_DB_PATH || path.resolve(__dirname, '../../data/smart-estate.duckdb');
const db = new duckdb.Database(DB_PATH);

// ── Schema ──────────────────────────────────────────────
db.exec(`
  -- Устройства
  CREATE TABLE IF NOT EXISTS devices (
    ieee_addr     VARCHAR PRIMARY KEY,
    friendly_name VARCHAR NOT NULL,
    model         VARCHAR,
    vendor        VARCHAR,
    type          VARCHAR DEFAULT 'unknown',
    room_id       INTEGER,
    status        VARCHAR DEFAULT 'online',
    last_seen     TIMESTAMP,
    added_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- Телеметрия (все показания датчиков)
  CREATE TABLE IF NOT EXISTS telemetry (
    id            BIGINT PRIMARY KEY,
    device_ieee   VARCHAR NOT NULL,
    property      VARCHAR NOT NULL,
    value         DOUBLE,
    unit          VARCHAR,
    raw_json      VARCHAR,
    ts            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE SEQUENCE IF NOT EXISTS telemetry_seq START 1;

  -- Команды (все что отправлено устройствам)
  CREATE TABLE IF NOT EXISTS commands (
    id            BIGINT PRIMARY KEY,
    device_ieee   VARCHAR NOT NULL,
    command       VARCHAR NOT NULL,
    payload       VARCHAR,
    status        VARCHAR DEFAULT 'pending',
    error_msg     VARCHAR,
    source        VARCHAR DEFAULT 'api',
    sent_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at  TIMESTAMP
  );
  CREATE SEQUENCE IF NOT EXISTS commands_seq START 1;

  -- Смены состояний (каждое изменение state устройства)
  CREATE TABLE IF NOT EXISTS state_changes (
    id            BIGINT PRIMARY KEY,
    device_ieee   VARCHAR NOT NULL,
    old_state     VARCHAR,
    new_state     VARCHAR,
    reason        VARCHAR DEFAULT 'mqtt',
    ts            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE SEQUENCE IF NOT EXISTS state_changes_seq START 1;

  -- Ошибки (все сбои)
  CREATE TABLE IF NOT EXISTS errors (
    id            BIGINT PRIMARY KEY,
    device_ieee   VARCHAR,
    error_type    VARCHAR NOT NULL,
    error_msg     VARCHAR,
    context       VARCHAR,
    ts            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE SEQUENCE IF NOT EXISTS errors_seq START 1;

  -- Комнаты
  CREATE TABLE IF NOT EXISTS rooms (
    id            INTEGER PRIMARY KEY,
    name          VARCHAR NOT NULL,
    icon          VARCHAR DEFAULT '🏠'
  );

  -- Сценарии автоматизации
  CREATE TABLE IF NOT EXISTS scenarios (
    id            INTEGER PRIMARY KEY,
    name          VARCHAR NOT NULL,
    description   VARCHAR,
    triggers_json VARCHAR,
    actions_json  VARCHAR,
    schedule_json VARCHAR,
    active        BOOLEAN DEFAULT true,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- Add schedule_json column if missing (for existing DBs)
  ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS schedule_json VARCHAR;

  -- История исполнения сценариев
  CREATE TABLE IF NOT EXISTS scenario_executions (
    id            BIGINT PRIMARY KEY,
    scenario_id   INTEGER NOT NULL,
    trigger_data  VARCHAR,
    actions_fired INTEGER DEFAULT 0,
    success       BOOLEAN DEFAULT true,
    error_msg     VARCHAR,
    ts            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE SEQUENCE IF NOT EXISTS scenario_executions_seq START 1;
  CREATE INDEX IF NOT EXISTS idx_scenario_exec_ts ON scenario_executions(ts);
  CREATE INDEX IF NOT EXISTS idx_scenario_exec_sid ON scenario_executions(scenario_id, ts);

  -- Группы устройств
  CREATE TABLE IF NOT EXISTS device_groups (
    id    INTEGER PRIMARY KEY,
    name  VARCHAR NOT NULL,
    type  VARCHAR DEFAULT 'custom',
    icon  VARCHAR DEFAULT '📦'
  );

  CREATE TABLE IF NOT EXISTS device_group_members (
    group_id    INTEGER NOT NULL,
    device_ieee VARCHAR NOT NULL,
    PRIMARY KEY (group_id, device_ieee)
  );

  -- Индексы для аналитики
  CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON telemetry(ts);
  CREATE INDEX IF NOT EXISTS idx_telemetry_device ON telemetry(device_ieee, property, ts);
  CREATE INDEX IF NOT EXISTS idx_commands_device ON commands(device_ieee, sent_at);
  CREATE INDEX IF NOT EXISTS idx_errors_ts ON errors(ts);
  CREATE INDEX IF NOT EXISTS idx_state_changes_device ON state_changes(device_ieee, ts);

  -- Дефолтные комнаты
  INSERT OR IGNORE INTO rooms VALUES (1, 'Гостиная', '🛋️');
  INSERT OR IGNORE INTO rooms VALUES (2, 'Кухня', '🍳');
  INSERT OR IGNORE INTO rooms VALUES (3, 'Спальня', '🛏️');
  INSERT OR IGNORE INTO rooms VALUES (4, 'Гараж', '🚗');
  INSERT OR IGNORE INTO rooms VALUES (5, 'Улица', '🌿');

  -- Дефолтные сценарии
  INSERT OR IGNORE INTO scenarios (id, name, description, triggers_json, actions_json, schedule_json) VALUES
    (1, 'Вентиляция по CO₂', 'CO₂ > 1000 ppm → открыть клапан',
     '{"logic":"ANY","conditions":[{"device":"air_monitor","property":"co2","operator":">","value":1000}]}',
     '[{"type":"mqtt","device":"vent_valve","command":"ON"},{"type":"notify","message":"🌬️ CO₂ > 1000 ppm — вентиляция открыта"}]',
     NULL),
    (2, 'Свет при закате', 'Освещённость < 50 lux ИЛИ закат → свет ON',
     '{"logic":"ANY","conditions":[{"device":"light_sensor","property":"illuminance","operator":"<","value":50}]}',
     '[{"type":"mqtt","device":"garden_light","command":"ON"},{"type":"notify","message":"💡 Сумерки — свет включён"}]',
     '{"type":"sunset","offset_minutes":-30}'),
    (3, 'Охрана периметра', 'Дверь открыта → уведомление',
     '{"logic":"ANY","conditions":[{"device":"door_sensor","property":"contact","operator":"=","value":1}]}',
     '[{"type":"notify","message":"⚠️ Периметр нарушен — дверь открыта!"}]',
     NULL),
    (4, 'Полив по расписанию', '06:00 + влажность < 40% → полив 10 мин',
     '{"logic":"ALL","conditions":[{"device":"soil_sensor","property":"soil_moisture","operator":"<","value":40}]}',
     '[{"type":"mqtt","device":"irrigation_valve","command":"ON"},{"type":"notify","message":"💧 Утренний полив — 10 минут"}]',
     '{"type":"cron","value":"0 6 * * *"}'),
    (5, 'Обогрев при низкой T°', 'Температура < 18°C → котёл ON',
     '{"logic":"ANY","conditions":[{"device":"temp_sensor","property":"temperature","operator":"<","value":18}]}',
     '[{"type":"mqtt","device":"boiler_relay","command":"ON"},{"type":"notify","message":"🔥 Температура < 18°C — котёл включён"}]',
     NULL),
    (6, 'Защита от протечки', 'Протечка → перекрыть воду',
     '{"logic":"ANY","conditions":[{"device":"leak_sensor","property":"water_leak","operator":"=","value":1}]}',
     '[{"type":"mqtt","device":"water_valve","command":"OFF"},{"type":"notify","message":"🚨 ОБНАРУЖЕНА ПРОТЕЧКА — вода перекрыта!"}]',
     NULL),
    (7, 'Комфорт: T° и влажность', '22-24°C И 40-60% влажности',
     '{"logic":"ALL","conditions":[{"device":"climate_sensor","property":"temperature","operator":">","value":22},{"device":"climate_sensor","property":"temperature","operator":"<","value":24},{"device":"climate_sensor","property":"humidity","operator":">","value":40},{"device":"climate_sensor","property":"humidity","operator":"<","value":60}]}',
     '[{"type":"notify","message":"✅ Климат в норме: 22-24°C, 40-60%"}]',
     NULL),
    (8, 'Экономия энергии', 'Мощность > 5 кВт → отключить некритичное',
     '{"logic":"ANY","conditions":[{"device":"power_meter","property":"power","operator":">","value":5000}]}',
     '[{"type":"mqtt","device":"non_critical_relay","command":"OFF"},{"type":"notify","message":"⚡ Потребление > 5 кВт — некритичные нагрузки отключены"}]',
     NULL),
    (9, 'Ночной режим', '23:00 → свет OFF, охрана ON',
     '{"logic":"ANY","conditions":[]}',
     '[{"type":"mqtt","device":"all_lights","command":"OFF"},{"type":"notify","message":"🌙 Ночной режим — свет выключен, охрана активирована"}]',
     '{"type":"cron","value":"0 23 * * *"}'),
    (10, 'Утреннее пробуждение', '07:00 → свет ON, кофе',
     '{"logic":"ANY","conditions":[]}',
     '[{"type":"mqtt","device":"bedroom_light","command":"ON"},{"type":"notify","message":"☀️ Доброе утро! Свет включён"}]',
     '{"type":"cron","value":"0 7 * * *"}');

  -- Дефолтные группы устройств
  INSERT OR IGNORE INTO device_groups VALUES (1, 'Весь свет', 'lighting', '💡');
  INSERT OR IGNORE INTO device_groups VALUES (2, 'Полив', 'irrigation', '💧');
  INSERT OR IGNORE INTO device_groups VALUES (3, 'Климат', 'climate', '🌡️');
  INSERT OR IGNORE INTO device_groups VALUES (4, 'Безопасность', 'security', '🔒');
  INSERT OR IGNORE INTO device_groups VALUES (5, 'Ворота и въезд', 'access', '🚪');
  INSERT OR IGNORE INTO device_groups VALUES (6, 'Мультимедиа', 'media', '🎵');

  -- Уставки климата
  CREATE TABLE IF NOT EXISTS climate_setpoints (
    device_ieee  VARCHAR PRIMARY KEY,
    target_temp  DECIMAL(4,1) DEFAULT 22.0,
    mode         VARCHAR DEFAULT 'off',
    hysteresis   DECIMAL(3,1) DEFAULT 0.5,
    min_temp     DECIMAL(4,1) DEFAULT 16.0,
    max_temp     DECIMAL(4,1) DEFAULT 28.0,
    schedule_json VARCHAR,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- Дефолтные уставки климата
  INSERT OR IGNORE INTO climate_setpoints (device_ieee, target_temp, mode, hysteresis)
    VALUES ('living_thermostat', 22.0, 'auto', 0.5);
  INSERT OR IGNORE INTO climate_setpoints (device_ieee, target_temp, mode, hysteresis)
    VALUES ('bedroom_thermostat', 20.0, 'auto', 0.5);

  -- Журнал доступа (ворота, калитка)
  CREATE TABLE IF NOT EXISTS gate_access_log (
    id          BIGINT PRIMARY KEY,
    device_ieee VARCHAR NOT NULL,
    action      VARCHAR NOT NULL,
    source      VARCHAR DEFAULT 'unknown',
    details     VARCHAR,
    ts          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE SEQUENCE IF NOT EXISTS gate_access_seq START 1;
  CREATE INDEX IF NOT EXISTS idx_gate_log_ts ON gate_access_log(ts);
  CREATE INDEX IF NOT EXISTS idx_gate_log_device ON gate_access_log(device_ieee, ts);

  -- Used nonces (anti-replay)
  CREATE TABLE IF NOT EXISTS used_nonces (
    nonce VARCHAR PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL 5 minute)
  );
  CREATE INDEX IF NOT EXISTS idx_nonces_expires ON used_nonces(expires_at);
`);

console.log('🦆 DuckDB ready:', DB_PATH);

// ── Prepared Statements ─────────────────────────────────

export const stmt = {
  // Devices
  upsertDevice: db.prepare(`
    INSERT INTO devices (ieee_addr, friendly_name, model, vendor, type, room_id, status, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, 'online', CURRENT_TIMESTAMP)
    ON CONFLICT(ieee_addr) DO UPDATE SET
      friendly_name = COALESCE(EXCLUDED.friendly_name, friendly_name),
      model = COALESCE(EXCLUDED.model, model),
      last_seen = CURRENT_TIMESTAMP
  `),

  getDevices: db.prepare(`
    SELECT d.*, r.name as room_name, r.icon as room_icon,
      (SELECT value FROM telemetry WHERE device_ieee = d.ieee_addr ORDER BY ts DESC LIMIT 1) as last_value
    FROM devices d LEFT JOIN rooms r ON d.room_id = r.id
    ORDER BY d.status DESC, d.last_seen DESC
  `),

  getDevice: db.prepare(`SELECT * FROM devices WHERE ieee_addr = ?`),

  setDeviceStatus: db.prepare(`UPDATE devices SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE ieee_addr = ?`),

  deleteDevice: db.prepare(`DELETE FROM devices WHERE ieee_addr = ?`),

  // Telemetry
  insertTelemetry: db.prepare(`
    INSERT INTO telemetry (id, device_ieee, property, value, unit, raw_json, ts)
    VALUES (nextval('telemetry_seq'), ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `),

  getTelemetry: db.prepare(`
    SELECT * FROM telemetry
    WHERE device_ieee = ? AND property = ? AND ts >= ?
    ORDER BY ts DESC LIMIT ?
  `),

  getLatestTelemetry: db.prepare(`
    SELECT t.* FROM telemetry t
    INNER JOIN (
      SELECT device_ieee, property, MAX(ts) as max_ts
      FROM telemetry GROUP BY device_ieee, property
    ) latest ON t.device_ieee = latest.device_ieee
      AND t.property = latest.property AND t.ts = latest.max_ts
  `),

  // Commands
  insertCommand: db.prepare(`
    INSERT INTO commands (id, device_ieee, command, payload, status, source, sent_at)
    VALUES (nextval('commands_seq'), ?, ?, ?, 'sent', ?, CURRENT_TIMESTAMP)
    RETURNING id
  `),

  completeCommand: db.prepare(`
    UPDATE commands SET status = ?, completed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'sent'
  `),

  failCommand: db.prepare(`
    UPDATE commands SET status = 'error', error_msg = ?, completed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'sent'
  `),

  getCommandHistory: db.prepare(`
    SELECT * FROM commands ORDER BY sent_at DESC LIMIT ?
  `),

  // State changes
  insertStateChange: db.prepare(`
    INSERT INTO state_changes (id, device_ieee, old_state, new_state, reason, ts)
    VALUES (nextval('state_changes_seq'), ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `),

  // Errors
  insertError: db.prepare(`
    INSERT INTO errors (id, device_ieee, error_type, error_msg, context, ts)
    VALUES (nextval('errors_seq'), ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `),

  getRecentErrors: db.prepare(`SELECT * FROM errors ORDER BY ts DESC LIMIT ?`),

  // Rooms
  getRooms: db.prepare(`SELECT * FROM rooms ORDER BY id`),

  // Scenarios
  getScenarios: db.prepare(`SELECT * FROM scenarios ORDER BY id`),
  getScenario: db.prepare(`SELECT * FROM scenarios WHERE id = ?`),
  getActiveScenarios: db.prepare(`SELECT * FROM scenarios WHERE active = true ORDER BY id`),
  toggleScenario: db.prepare(`UPDATE scenarios SET active = NOT active WHERE id = ?`),

  // Scenario executions
  insertScenarioExec: db.prepare(`
    INSERT INTO scenario_executions (id, scenario_id, trigger_data, actions_fired, success, error_msg, ts)
    VALUES (nextval('scenario_executions_seq'), ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `),
  getScenarioExecutions: db.prepare(`
    SELECT * FROM scenario_executions WHERE scenario_id = ? ORDER BY ts DESC LIMIT ?
  `),

  // Aggregations
  getEnergyToday: db.prepare(`
    SELECT SUM(value) as total_kwh FROM telemetry
    WHERE property = 'energy' AND ts >= CURRENT_DATE
  `),

  getCurrentPower: db.prepare(`
    SELECT SUM(value) as total_w FROM telemetry t
    INNER JOIN (
      SELECT device_ieee, MAX(ts) as max_ts FROM telemetry
      WHERE property = 'power' GROUP BY device_ieee
    ) latest ON t.device_ieee = latest.device_ieee AND t.ts = latest.max_ts
    WHERE t.property = 'power'
  `),

  getDeviceStats: db.prepare(`
    SELECT property, MIN(value) as min, MAX(value) as max, AVG(value) as avg, COUNT(*) as cnt
    FROM telemetry WHERE device_ieee = ? AND ts >= ?
    GROUP BY property
  `),

  // Nonce management
  insertNonce: db.prepare(`INSERT INTO used_nonces (nonce, expires_at) VALUES (?, CURRENT_TIMESTAMP + INTERVAL 5 minute)`),
};

// ── Helper Functions ────────────────────────────────────

export function query(sql: string, ...params: any[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, ...params, (err: Error | null, rows: any[]) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export function logError(device_ieee: string | null, error_type: string, error_msg: string, context?: string) {
  stmt.insertError.run(device_ieee, error_type, error_msg, context || null);
  console.error(`❌ [${error_type}] ${device_ieee || 'system'}: ${error_msg}`);
}

export function logStateChange(device_ieee: string, old_state: string, new_state: string, reason: string = 'mqtt') {
  stmt.insertStateChange.run(device_ieee, old_state, new_state, reason);
  console.log(`🔄 ${device_ieee}: ${old_state} → ${new_state} (${reason})`);
}

export function logCommand(device_ieee: string, command: string, payload: string, source: string = 'api'): number {
  // Insert command and get the ID via a separate query
  stmt.insertCommand.run(device_ieee, command, payload, source);
  // DuckDB: get current sequence value  
  let id = Date.now();
  try {
    const result = query("SELECT currval('commands_seq') as id").then((rows: any[]) => {
      if (rows.length > 0) id = rows[0].id;
    }).catch(() => {});
  } catch {}
  console.log(`📤 [cmd #${id}] ${device_ieee}: ${command}`);
  return id;
}

export function logScenarioExec(scenario_id: number, trigger_data: string, actions_fired: number, success: boolean, error_msg?: string) {
  stmt.insertScenarioExec.run(scenario_id, trigger_data, actions_fired, success, error_msg || null);
  const icon = success ? '✅' : '❌';
  console.log(`${icon} [scenario #${scenario_id}] ${actions_fired} actions fired`);
}

export { db, DB_PATH };
