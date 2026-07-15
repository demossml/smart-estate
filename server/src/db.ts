import type BetterSqlite3 from 'better-sqlite3';
import BetterSqlite3Default from 'better-sqlite3';
import * as path from 'path';
import logger from './logger';
import { normalizeSql } from './sql-normalize';

const DB_PATH = process.env.SMART_ESTATE_DB_PATH || path.resolve(__dirname, '../../data/smart-estate.db');
const db: BetterSqlite3.Database = new (BetterSqlite3Default as any)(DB_PATH);

// ── Performance pragmas ──
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -8000');  // 8 MB
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    ieee_addr     TEXT PRIMARY KEY,
    friendly_name TEXT NOT NULL,
    model         TEXT,
    vendor        TEXT,
    type          TEXT DEFAULT 'unknown',
    room_id       INTEGER,
    params_json   TEXT DEFAULT '{}',
    status        TEXT DEFAULT 'online',
    is_demo       INTEGER DEFAULT 0,
    type_manually_set INTEGER DEFAULT 0,
    room_manually_set  INTEGER DEFAULT 0,
    last_seen     TEXT,
    added_at      TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS telemetry (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    device_ieee   TEXT NOT NULL,
    property      TEXT NOT NULL,
    value         REAL,
    unit          TEXT,
    raw_json      TEXT,
    ts            TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS commands (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    device_ieee   TEXT NOT NULL,
    command       TEXT NOT NULL,
    payload       TEXT,
    status        TEXT DEFAULT 'pending',
    error_msg     TEXT,
    source        TEXT DEFAULT 'api',
    sent_at       TEXT DEFAULT (datetime('now')),
    completed_at  TEXT
  );
  CREATE TABLE IF NOT EXISTS state_changes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    device_ieee   TEXT NOT NULL,
    old_state     TEXT,
    new_state     TEXT,
    reason        TEXT DEFAULT 'mqtt',
    ts            TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS errors (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    device_ieee   TEXT,
    error_type    TEXT NOT NULL,
    error_msg     TEXT,
    context       TEXT,
    ts            TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS rooms (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    icon          TEXT DEFAULT '🏠'
  );
  INSERT OR IGNORE INTO rooms (id, name, icon) VALUES (1, 'Гостиная', '🏠');
  CREATE TABLE IF NOT EXISTS scenarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    description   TEXT,
    triggers_json TEXT,
    actions_json  TEXT,
    schedule_json TEXT,
    active        INTEGER DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS scenario_executions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id   INTEGER NOT NULL,
    trigger_data  TEXT,
    actions_fired INTEGER DEFAULT 0,
    success       INTEGER DEFAULT 1,
    error_msg     TEXT,
    ts            TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS device_groups (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    type  TEXT DEFAULT 'custom',
    icon  TEXT DEFAULT '📦'
  );
  CREATE TABLE IF NOT EXISTS device_group_members (
    group_id    INTEGER NOT NULL,
    device_ieee TEXT NOT NULL,
    PRIMARY KEY (group_id, device_ieee)
  );
  CREATE TABLE IF NOT EXISTS climate_setpoints (
    device_ieee  TEXT PRIMARY KEY,
    target_temp  REAL DEFAULT 22.0,
    mode         TEXT DEFAULT 'off',
    hysteresis   REAL DEFAULT 0.5,
    min_temp     REAL DEFAULT 16.0,
    max_temp     REAL DEFAULT 28.0,
    schedule_json TEXT,
    updated_at   TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS gate_access_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_ieee TEXT NOT NULL,
    action      TEXT NOT NULL,
    source      TEXT DEFAULT 'unknown',
    details     TEXT,
    ts          TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS discovery_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ieee_address  TEXT NOT NULL,
    friendly_name TEXT,
    model         TEXT,
    vendor        TEXT,
    event_type    TEXT DEFAULT 'device_announce',
    status        TEXT DEFAULT 'pending',
    suggested_type TEXT,
    exposes_json  TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ai_providers (
    id              TEXT PRIMARY KEY,
    provider        TEXT NOT NULL,
    token_enc       TEXT NOT NULL,
    base_url        TEXT,
    model           TEXT,
    use_in_scenarios INTEGER DEFAULT 0,
    status          TEXT DEFAULT 'disconnected',
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS api_keys (
    key_name    TEXT PRIMARY KEY,
    key_value   TEXT NOT NULL,
    updated_at  TEXT DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO api_keys (key_name, key_value) VALUES ('x-api-key', '');
  CREATE TABLE IF NOT EXISTS voice_pending_actions (
    id            TEXT PRIMARY KEY,
    text          TEXT NOT NULL,
    kind          TEXT NOT NULL,
    payload_json  TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS voice_suggestions (
    id            TEXT PRIMARY KEY,
    text          TEXT NOT NULL,
    payload_json  TEXT,
    accepted      INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS used_nonces (
    nonce TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT DEFAULT (datetime('now', '+5 minutes'))
  );
  CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON telemetry(ts);
  CREATE INDEX IF NOT EXISTS idx_telemetry_device ON telemetry(device_ieee, property, ts);
  CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts ON telemetry(device_ieee, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_commands_device ON commands(device_ieee, sent_at);
  CREATE INDEX IF NOT EXISTS idx_errors_ts ON errors(ts);
  CREATE INDEX IF NOT EXISTS idx_state_changes_device ON state_changes(device_ieee, ts);
  CREATE INDEX IF NOT EXISTS idx_scenario_exec_ts ON scenario_executions(ts);
  CREATE INDEX IF NOT EXISTS idx_scenario_exec_sid ON scenario_executions(scenario_id, ts);
  CREATE INDEX IF NOT EXISTS idx_gate_log_ts ON gate_access_log(ts);
  CREATE INDEX IF NOT EXISTS idx_gate_log_device ON gate_access_log(device_ieee, ts);
  CREATE INDEX IF NOT EXISTS idx_nonces_expires ON used_nonces(expires_at);
  CREATE INDEX IF NOT EXISTS idx_discovery_ieee_status ON discovery_events(ieee_address, status, created_at);
`);

// ── Idempotent migration: is_demo ──────────────────────────
const hasDeviceDemo = db.prepare(`SELECT COUNT(*) as cnt FROM pragma_table_info('devices') WHERE name = 'is_demo'`).get() as any;
if (!hasDeviceDemo.cnt) {
  db.exec(`ALTER TABLE devices ADD COLUMN is_demo INTEGER DEFAULT 0`);
  logger.log("[DB] ", '➕ Миграция: devices.is_demo добавлена');
}
const hasRoomDemo = db.prepare(`SELECT COUNT(*) as cnt FROM pragma_table_info('rooms') WHERE name = 'is_demo'`).get() as any;
if (!hasRoomDemo.cnt) {
  db.exec(`ALTER TABLE rooms ADD COLUMN is_demo INTEGER DEFAULT 0`);
  logger.log("[DB] ", '➕ Миграция: rooms.is_demo добавлена');
}

// ── Migration: remove old hardcoded rooms 2-5 ──────────────
const legacyRoomCount = db.prepare(`SELECT COUNT(*) as cnt FROM rooms WHERE id IN (2,3,4,5)`).get() as any;
if (legacyRoomCount.cnt > 0) {
  db.exec(`UPDATE devices SET room_id = 1 WHERE room_id IN (2,3,4,5)`);
  db.exec(`DELETE FROM rooms WHERE id IN (2,3,4,5)`);
  logger.log("[DB] ", '🧹 Миграция: удалены хардкодные комнаты 2-5, устройства перенесены в Гостиную');
}

// ── Migration: type_manually_set, room_manually_set ──
const hasTypeManual = db.prepare(`SELECT COUNT(*) as cnt FROM pragma_table_info('devices') WHERE name = 'type_manually_set'`).get() as any;
if (!hasTypeManual.cnt) {
  db.exec(`ALTER TABLE devices ADD COLUMN type_manually_set INTEGER DEFAULT 0`);
  db.exec(`ALTER TABLE devices ADD COLUMN room_manually_set INTEGER DEFAULT 0`);
  logger.log("[DB] ", '➕ Миграция: devices.type_manually_set + room_manually_set добавлены');
}

// ── Migration: discovery_events.suggested_type / exposes_json ──
// Раньше suggested_type/exposes уходили только в WebSocket-broadcast и терялись,
// если никто не был подключён в момент interview или страница была перезагружена.
// Теперь сохраняем их, чтобы REST-эндпоинт /api/devices/pending мог их отдать.
const hasSuggestedType = db.prepare(`SELECT COUNT(*) as cnt FROM pragma_table_info('discovery_events') WHERE name = 'suggested_type'`).get() as any;
if (!hasSuggestedType.cnt) {
  db.exec(`ALTER TABLE discovery_events ADD COLUMN suggested_type TEXT`);
  db.exec(`ALTER TABLE discovery_events ADD COLUMN exposes_json TEXT`);
  logger.log("[DB] ", '➕ Миграция: discovery_events.suggested_type + exposes_json добавлены');
}

// ── Migration: devices.battery_level ──
const hasBatteryLevel = db.prepare(`SELECT COUNT(*) as cnt FROM pragma_table_info('devices') WHERE name = 'battery_level'`).get() as any;
if (!hasBatteryLevel.cnt) {
  db.exec(`ALTER TABLE devices ADD COLUMN battery_level INTEGER`);
  logger.log("[DB] ", '➕ Миграция: devices.battery_level добавлена');
}

// Default scenarios
const defaultScenarios = db.prepare(`SELECT COUNT(*) as cnt FROM scenarios`) as any;
if (defaultScenarios.get().cnt === 0) {
  db.exec(`
    INSERT INTO scenarios (id, name, description, triggers_json, actions_json, schedule_json) VALUES
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
     '[{"type":"notify","message":"⚠️ Периметр нарушен — дверь открыта!"}]', NULL),
    (4, 'Полив по расписанию', '06:00 + влажность < 40% → полив 10 мин',
     '{"logic":"ALL","conditions":[{"device":"soil_sensor","property":"soil_moisture","operator":"<","value":40}]}',
     '[{"type":"mqtt","device":"irrigation_valve","command":"ON"},{"type":"notify","message":"💧 Утренний полив — 10 минут"}]',
     '{"type":"cron","value":"0 6 * * *"}'),
    (5, 'Обогрев при низкой T°', 'Температура < 18°C → котёл ON',
     '{"logic":"ANY","conditions":[{"device":"temp_sensor","property":"temperature","operator":"<","value":18}]}',
     '[{"type":"mqtt","device":"boiler_relay","command":"ON"},{"type":"notify","message":"🔥 Температура < 18°C — котёл включён"}]', NULL),
    (6, 'Защита от протечки', 'Протечка → перекрыть воду',
     '{"logic":"ANY","conditions":[{"device":"leak_sensor","property":"water_leak","operator":"=","value":1}]}',
     '[{"type":"mqtt","device":"water_valve","command":"OFF"},{"type":"notify","message":"🚨 ОБНАРУЖЕНА ПРОТЕЧКА — вода перекрыта!"}]', NULL),
    (7, 'Комфорт: T° и влажность', '22-24°C И 40-60% влажности',
     '{"logic":"ALL","conditions":[{"device":"climate_sensor","property":"temperature","operator":">","value":22},{"device":"climate_sensor","property":"temperature","operator":"<","value":24},{"device":"climate_sensor","property":"humidity","operator":">","value":40},{"device":"climate_sensor","property":"humidity","operator":"<","value":60}]}',
     '[{"type":"notify","message":"✅ Климат в норме: 22-24°C, 40-60%"}]', NULL),
    (8, 'Экономия энергии', 'Мощность > 5 кВт → отключить некритичное',
     '{"logic":"ANY","conditions":[{"device":"power_meter","property":"power","operator":">","value":5000}]}',
     '[{"type":"mqtt","device":"non_critical_relay","command":"OFF"},{"type":"notify","message":"⚡ Потребление > 5 кВт — некритичные нагрузки отключены"}]', NULL),
    (9, 'Ночной режим', '23:00 → свет OFF, охрана ON',
     '{"logic":"ANY","conditions":[]}',
     '[{"type":"mqtt","device":"all_lights","command":"OFF"},{"type":"notify","message":"🌙 Ночной режим — свет выключен, охрана активирована"}]',
     '{"type":"cron","value":"0 23 * * *"}'),
    (10, 'Утреннее пробуждение', '07:00 → свет ON, кофе',
     '{"logic":"ANY","conditions":[]}',
     '[{"type":"mqtt","device":"bedroom_light","command":"ON"},{"type":"notify","message":"☀️ Доброе утро! Свет включён"}]',
     '{"type":"cron","value":"0 7 * * *"}');

    INSERT OR IGNORE INTO device_groups VALUES (1, 'Весь свет', 'lighting', '💡');
    INSERT OR IGNORE INTO device_groups VALUES (2, 'Полив', 'irrigation', '💧');
    INSERT OR IGNORE INTO device_groups VALUES (3, 'Климат', 'climate', '🌡️');
    INSERT OR IGNORE INTO device_groups VALUES (4, 'Безопасность', 'security', '🔒');
    INSERT OR IGNORE INTO device_groups VALUES (5, 'Ворота и въезд', 'access', '🚪');
    INSERT OR IGNORE INTO device_groups VALUES (6, 'Мультимедиа', 'media', '🎵');

    INSERT OR IGNORE INTO climate_setpoints (device_ieee, target_temp, mode, hysteresis)
      VALUES ('living_thermostat', 22.0, 'auto', 0.5);
    INSERT OR IGNORE INTO climate_setpoints (device_ieee, target_temp, mode, hysteresis)
      VALUES ('bedroom_thermostat', 20.0, 'auto', 0.5);
  `);
}

logger.log("[DB] ", '🗄️  SQLite ready:', DB_PATH);

// ── Prepared Statements ─────────────────────────────────

export const stmt: any = {
  // Devices
  upsertDevice: db.prepare(`
    INSERT INTO devices (ieee_addr, friendly_name, model, vendor, type, room_id, params_json, status, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, '{}', 'online', datetime('now'))
    ON CONFLICT(ieee_addr) DO UPDATE SET
      friendly_name = COALESCE(excluded.friendly_name, friendly_name),
      model = COALESCE(excluded.model, model),
      vendor = COALESCE(excluded.vendor, vendor),
      type = COALESCE(excluded.type, type),
      room_id = COALESCE(excluded.room_id, room_id),
      last_seen = datetime('now')
  `),

  // Для MQTT-обновлений — перезаписывает type/room_id ТОЛЬКО если они не были установлены вручную
  upsertDeviceFromDiscovery: db.prepare(`
    INSERT INTO devices (ieee_addr, friendly_name, model, vendor, type, room_id, params_json, status, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, '{}', 'online', datetime('now'))
    ON CONFLICT(ieee_addr) DO UPDATE SET
      friendly_name = COALESCE(excluded.friendly_name, friendly_name),
      model = COALESCE(excluded.model, model),
      type = CASE WHEN devices.type_manually_set = 0 THEN COALESCE(excluded.type, devices.type) ELSE devices.type END,
      room_id = CASE WHEN devices.room_manually_set = 0 THEN COALESCE(excluded.room_id, devices.room_id) ELSE devices.room_id END,
      last_seen = datetime('now')
  `),

  getDevices: db.prepare(`
    SELECT d.*, r.name as room_name, r.icon as room_icon,
      (SELECT value FROM telemetry WHERE device_ieee = d.ieee_addr ORDER BY ts DESC LIMIT 1) as last_value
    FROM devices d LEFT JOIN rooms r ON d.room_id = r.id
    ORDER BY d.status DESC, d.last_seen DESC
  `),

  getDevice: db.prepare(`SELECT * FROM devices WHERE ieee_addr = ?`),

  setDeviceStatus: db.prepare(`UPDATE devices SET status = ?, last_seen = datetime('now') WHERE ieee_addr = ?`),

  updateLastSeen: db.prepare(`UPDATE devices SET last_seen = datetime('now') WHERE ieee_addr = ?`),

  updateBatteryLevel: db.prepare(`UPDATE devices SET battery_level = ? WHERE ieee_addr = ?`),

  deleteDevice: db.prepare(`DELETE FROM devices WHERE ieee_addr = ?`),

  updateDevice: db.prepare(`
    UPDATE devices SET
      friendly_name = COALESCE(?, friendly_name),
      type = COALESCE(?, type),
      type_manually_set = CASE WHEN ? IS NOT NULL THEN 1 ELSE type_manually_set END,
      room_id = COALESCE(?, room_id),
      room_manually_set = CASE WHEN ? IS NOT NULL THEN 1 ELSE room_manually_set END,
      params_json = COALESCE(?, params_json)
    WHERE ieee_addr = ?
  `),

  // Telemetry
  insertTelemetry: db.prepare(`
    INSERT INTO telemetry (device_ieee, property, value, unit, raw_json, ts)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
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
    INSERT INTO commands (device_ieee, command, payload, status, source, sent_at)
    VALUES (?, ?, ?, 'sent', ?, datetime('now'))
  `),

  completeCommand: db.prepare(`
    UPDATE commands SET status = ?, completed_at = datetime('now')
    WHERE id = ? AND status = 'sent'
  `),

  failCommand: db.prepare(`
    UPDATE commands SET status = 'error', error_msg = ?, completed_at = datetime('now')
    WHERE id = ? AND status = 'sent'
  `),

  getCommandHistory: db.prepare(`
    SELECT * FROM commands ORDER BY sent_at DESC LIMIT ?
  `),

  // State changes
  insertStateChange: db.prepare(`
    INSERT INTO state_changes (device_ieee, old_state, new_state, reason, ts)
    VALUES (?, ?, ?, ?, datetime('now'))
  `),

  // Errors
  insertError: db.prepare(`
    INSERT INTO errors (device_ieee, error_type, error_msg, context, ts)
    VALUES (?, ?, ?, ?, datetime('now'))
  `),

  getRecentErrors: db.prepare(`SELECT * FROM errors ORDER BY ts DESC LIMIT ?`),

  // Rooms
  getRooms: db.prepare(`SELECT * FROM rooms ORDER BY id`),

  getRoomsWithDeviceCount: db.prepare(`
    SELECT r.*, CAST(COALESCE(d.device_count, 0) AS INTEGER) as device_count
    FROM rooms r
    LEFT JOIN (SELECT room_id, COUNT(*) as device_count FROM devices GROUP BY room_id) d
      ON r.id = d.room_id
    ORDER BY r.id
  `),

  // Scenarios
  getScenarios: db.prepare(`SELECT * FROM scenarios ORDER BY id`),
  getScenario: db.prepare(`SELECT * FROM scenarios WHERE id = ?`),
  getActiveScenarios: db.prepare(`SELECT * FROM scenarios WHERE active = 1 ORDER BY id`),
  toggleScenario: db.prepare(`UPDATE scenarios SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?`),

  // Scenario executions
  insertScenarioExec: db.prepare(`
    INSERT INTO scenario_executions (scenario_id, trigger_data, actions_fired, success, error_msg, ts)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `),
  getScenarioExecutions: db.prepare(`
    SELECT * FROM scenario_executions WHERE scenario_id = ? ORDER BY ts DESC LIMIT ?
  `),

  // Aggregations
  getEnergyToday: db.prepare(`
    SELECT SUM(value) as total_kwh FROM telemetry
    WHERE property = 'energy' AND ts >= date('now')
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
  insertNonce: db.prepare(`INSERT OR IGNORE INTO used_nonces (nonce, expires_at) VALUES (?, datetime('now', '+5 minutes'))`),
  getNonce: db.prepare(`SELECT nonce FROM used_nonces WHERE nonce = ? AND expires_at > datetime('now')`),
  // НАХОДКА (Модуль 6, index.ts): этот стейтмент вызывался каждый час из
  // index.ts (`stmt.cleanupExpiredNonces.run()`), но не существовал вообще —
  // TypeError ловился try/catch и тихо логировался как ошибка каждый час,
  // used_nonces никогда не чистился этим путём (спасало только вероятностное
  // удаление в crypto.ts при каждом 10-м вызове checkAndRecordNonce).
  cleanupExpiredNonces: db.prepare(`DELETE FROM used_nonces WHERE expires_at < datetime('now')`),

  // Discovery events
  // Сигнатура расширена: (ieee, friendly_name, model, vendor, suggested_type, exposes_json)
  insertDiscoveryEvent: db.prepare(`
    INSERT INTO discovery_events (ieee_address, friendly_name, model, vendor, event_type, status, suggested_type, exposes_json)
    VALUES (?, ?, ?, ?, 'device_announce', 'pending', ?, ?)
  `),
  getDiscoveryEvents: db.prepare(`
    SELECT * FROM discovery_events ORDER BY created_at DESC LIMIT ?
  `),
  // Последнее событие на каждый ieee_address, у которого статус ещё 'pending' —
  // то есть устройство обнаружено, но пользователь его не подтвердил.
  getPendingDiscoveryEvents: db.prepare(`
    SELECT de.*
    FROM discovery_events de
    INNER JOIN (
      SELECT ieee_address, MAX(created_at) as max_created
      FROM discovery_events
      WHERE status = 'pending'
      GROUP BY ieee_address
    ) latest ON de.ieee_address = latest.ieee_address AND de.created_at = latest.max_created
    WHERE de.ieee_address NOT IN (SELECT ieee_addr FROM devices)
    ORDER BY de.created_at DESC
  `),
  confirmDiscovery: db.prepare(`
    UPDATE discovery_events SET status = 'confirmed' WHERE ieee_address = ?
  `),
};

// ── SQL Compatibility Layer ──
// Normalize non-SQLite syntax (INTERVAL, ::DECIMAL, EXTRACT, NOW)
// via sql-normalize module

// ── Helper Functions ────────────────────────────────────

export function query(sql: string, ...params: any[]): Promise<any[]> {
  const translated = normalizeSql(sql);
  return new Promise((resolve, reject) => {
    try {
      const prepared = db.prepare(translated);
      const trimmed = translated.trim().toUpperCase();
      if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || trimmed.startsWith('PRAGMA') || trimmed.startsWith('ANALYZE')) {
        const rows = params.length > 0 ? prepared.all(...params) : prepared.all();
        resolve(rows);
      } else {
        prepared.run(...params);
        resolve([]);
      }
    } catch (err) {
      reject(err);
    }
  });
}

export function exec(sql: string, ...params: any[]): Promise<any> {
  const translated = normalizeSql(sql);
  return new Promise((resolve, reject) => {
    try {
      const prepared = db.prepare(translated);
      const info = params.length > 0 ? prepared.run(...params) : prepared.run();
      resolve(info);
    } catch (err) {
      reject(err);
    }
  });
}

export function logErrorWithLog(device_ieee: string | null, error_type: string, error_msg: string, context?: string) {
  stmt.insertError.run(device_ieee, error_type, error_msg, context || null);
  logger.error("[DB] ", `❌ [${error_type}] ${device_ieee || 'system'}: ${error_msg}`);
}

export function logStateChange(device_ieee: string, old_state: string, new_state: string, reason: string = 'mqtt') {
  stmt.insertStateChange.run(device_ieee, old_state, new_state, reason);
  logger.log("[DB] ", `🔄 ${device_ieee}: ${old_state} → ${new_state} (${reason})`);
}

export function logCommand(device_ieee: string, command: string, payload: string, source: string = 'api'): number {
  const info = stmt.insertCommand.run(device_ieee, command, payload, source);
  const id = info.lastInsertRowid as number;
  logger.log("[DB] ", `📤 [cmd #${id}] ${device_ieee}: ${command}`);
  return id;
}

export function logScenarioExec(scenario_id: number, trigger_data: string, actions_fired: number, success: boolean, error_msg?: string) {
  stmt.insertScenarioExec.run(scenario_id, trigger_data, actions_fired, success ? 1 : 0, error_msg || null);
  const icon = success ? '✅' : '❌';
  logger.log("[DB] ", `${icon} [scenario #${scenario_id}] ${actions_fired} actions fired`);
}

export { db, DB_PATH };
export type { BetterSqlite3 };