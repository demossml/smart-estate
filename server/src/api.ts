import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { join } from 'path';
import { randomBytes, createHmac } from 'crypto';
import rateLimit from 'express-rate-limit';
import { encryptToken, decryptToken } from './crypto';
import { stmt, query, logErrorWithLog, logCommand, logStateChange, DB_PATH } from './db';
import { authMiddleware, optionalAuth } from './middleware/auth';
import { toggleDemoDevice, isDemoMode } from './demo';
import { attachWebSocket, publishCommand, lastPresenceAt } from './mqtt-ws';
import { get as httpGet } from 'http';
import mqtt from 'mqtt';
import cookieParser from 'cookie-parser';
import logger from './logger';

// Fix BigInt serialization for DuckDB
(BigInt.prototype as any).toJSON = function () { return Number(this); };

const app = express();
app.set('trust proxy', 'loopback'); // Caddy проксирует с localhost

// ── Static files (BEFORE helmet to ensure CSP doesn't interfere) ──
const clientDist = join(__dirname, '..', '..', 'client-app', 'dist');
app.use('/assets', express.static(join(clientDist, 'assets'), { maxAge: 0 }));
app.use('/icons', express.static(join(clientDist, 'icons'), { maxAge: 0 }));

// ── Security Headers ─────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for Mini App
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ─────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin (no Origin header) and any private/local address
    if (!origin) return callback(null, true);
    const host = origin.replace(/^https?:\/\//, '').split(':')[0];
    // localhost, 127.x, 192.168.x, 10.x, 172.16-31.x, 0.0.0.0
    if (
      host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' ||
      host.startsWith('192.168.') || host.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) return callback(null, true);
    if (origin === 'https://t.me' || origin === 'https://web.telegram.org') return callback(null, true);
    const extra = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
    if (extra.includes(origin)) return callback(null, true);
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Signature', 'X-Timestamp', 'X-Nonce', 'X-Telegram-InitData', 'X-CSRF-Token'],
  maxAge: 86400,
}));

// ── Rate Limiting ────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60_000,       // 1 minute
  max: 500,               // 8 polls/min × 5s intervals + user actions
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, slow down' },
});
app.use(limiter);

// Stricter limit for command endpoints
const commandLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,                // 30 commands per minute
  standardHeaders: true,
  message: { ok: false, error: 'Command rate limit exceeded' },
});

app.use(express.json());
app.use(cookieParser());

// ── CSRF Protection (self-hosted HMAC double-submit) ───
// Не используем csrf-csrf из-за проблем с куками (отсутствие куки → 403)
// Собственная реализация: GET /api/csrf-token возвращает HMAC-подпись,
// мутации проверяют подпись без куки (достаточно заголовка X-CSRF-Token)

const CSRF_SECRET = process.env.CSRF_SECRET || 'smart-estate-csrf-secret-2026';
const CSRF_ENABLED = !!process.env.CSRF_SECRET; // только если явно задан CSRF_SECRET

/** Генерирует CSRF-токен: nonce.hmac */
function csrfGenerate(_req: any, res: any): string {
  const nonce = randomBytes(16).toString('hex');
  const hmac = createHmac('sha256', CSRF_SECRET).update(nonce).digest('hex').slice(0, 16);
  return `${nonce}.${hmac}`;
}

/** Проверяет HMAC-подпись токена. Возвращает true/false */
function csrfValidate(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [nonce, hmac] = parts;
  const expected = createHmac('sha256', CSRF_SECRET).update(nonce).digest('hex').slice(0, 16);
  return hmac === expected;
}

// ── Хелпер: SQL-условие для фильтрации demo-данных ────
// В Live-режиме не показываем demo-объекты.
// В Demo-режиме показываем только demo-объекты + базовые (без is_demo).
// Используется через строковую интерполяцию в SQL-запросах чтения.
function demoFilter(alias: string): string {
  if (isDemoMode()) {
    // Demo-режим: показываем только demo + записи без флага
    return `(${alias}.is_demo = 1 OR ${alias}.is_demo IS NULL)`;
  }
  // Live-режим: не показываем demo
  return `(${alias}.is_demo IS NULL OR ${alias}.is_demo = 0)`;
}

// CSRF middleware: проверка только на мутациях
app.use((req, res, next) => {
  // GET/HEAD/voice — безопасные методы
  if (req.method === 'GET' || req.method === 'HEAD' || req.path.startsWith('/api/voice')) {
    return next();
  }
  // Если CSRF не включён (нет CSRF_SECRET) — пропускаем
  if (!CSRF_ENABLED) return next();
  // Если не заданы API_KEYS — CSRF не нужен
  if (!process.env.API_KEYS) return next();
  // Получаем токен
  const token = req.headers['x-csrf-token'] as string;
  if (!token) return next(); // soft mode: без токена пропускаем
  // Валидируем
  if (!csrfValidate(token)) {
    return res.status(403).json({ ok: false, error: 'Invalid CSRF token' });
  }
  next();
});

// Auth: enforce if API_KEYS is configured, otherwise allow all
if (process.env.NODE_ENV === 'production' && !process.env.API_KEYS) {
  console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: переменная API_KEYS обязательна в production, иначе API полностью открыт без аутентификации.');
  process.exit(1);
}
let authLogged = false;
app.use((req, res, next) => {
  const enforceAuth = !!(process.env.API_KEYS || '');
  if (!enforceAuth) return optionalAuth(req, res, next);
  if (!authLogged) {
    logger.log("[API] ", '🔒 Auth middleware active');
    authLogged = true;
  }
  return authMiddleware(req, res, next);
});

// ── GET /api/csrf-token ─────────────────────────────────
app.get('/api/csrf-token', (_req, res) => {
  try {
    const token = csrfGenerate(_req, res);
    res.json({ ok: true, token, enabled: CSRF_ENABLED });
  } catch {
    // Аварийный fallback
    const nonce = randomBytes(16).toString('hex');
    const hmac = createHmac('sha256', CSRF_SECRET).update(nonce).digest('hex').slice(0, 16);
    const fallbackToken = `${nonce}.${hmac}`;
    res.json({ ok: true, token: fallbackToken, fallback: true });
  }
});

// ── GET /api/status ─────────────────────────────────────
app.get('/api/status', async (_req, res) => {
  try {
    const devices = await query('SELECT COUNT(*) as cnt FROM devices');
    const online = await query("SELECT COUNT(*) as cnt FROM devices WHERE status = 'online'");
    const errors24h = await query(
      "SELECT COUNT(*) as cnt FROM errors WHERE ts >= datetime('now', '-24 hours')"
    );
    res.json({
      ok: true,
      db: DB_PATH,
      devices: { total: devices[0]?.cnt || 0, online: online[0]?.cnt || 0 },
      errors24h: errors24h[0]?.cnt || 0,
    });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'status');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/devices ────────────────────────────────────
app.get('/api/devices', async (req, res) => {
  try {
    const rawFilter = req.query.filter as string;
    
    // Only allow 'online' and 'offline'; treat anything else (empty, SQL injection, etc.) as no filter
    const filter = (rawFilter === 'online' || rawFilter === 'offline') ? rawFilter : undefined;

    // Pagination: limit (max 100, default 50), offset (default 0)
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    // Build WHERE clause for filtering
    const demoCond = demoFilter('d');
    let whereClause = ` WHERE ${demoCond}`;
    if (filter === 'online') whereClause += ` AND d.status = 'online'`;
    else if (filter === 'offline') whereClause += ` AND d.status = 'offline'`;

    // Total count (before pagination)
    const countResult = await query(`SELECT COUNT(*) as total FROM devices d${whereClause}`);
    const total = countResult[0]?.total || 0;

    // Single query with correlated subquery — no N+1
    const sql = `
      SELECT d.*, r.name as room_name, r.icon as room_icon,
        (SELECT COALESCE(json_group_array(
          json_object('property', t.property, 'value', t.value, 'unit', t.unit)
        ), '[]')
         FROM (SELECT property, value, unit FROM (
               SELECT property, value, unit,
                 ROW_NUMBER() OVER (PARTITION BY property ORDER BY ts DESC) as rn
               FROM telemetry WHERE device_ieee = d.ieee_addr
             ) sub WHERE rn = 1 LIMIT 6) t
        ) as latest_telemetry
      FROM devices d LEFT JOIN rooms r ON d.room_id = r.id
      ${whereClause}
      ORDER BY d.status DESC, d.last_seen DESC
      LIMIT ? OFFSET ?
    `;

    const rows = await query(sql, limit, offset);

    // Parse JSON-encoded telemetry
    const devices = rows.map((row: any) => {
      const telemetry = typeof row.latest_telemetry === 'string'
        ? JSON.parse(row.latest_telemetry)
        : row.latest_telemetry || [];
      // Last presence for motion/presence sensors
      const lastSeen = (row.type === 'presence_sensor' || row.type === 'motion_sensor') ? lastPresenceAt.get(row.ieee_addr) : null;
      const last_presence_minutes = lastSeen ? Math.floor((Date.now() - lastSeen) / 60000) : null;
      return {
        ...row,
        latest_telemetry: telemetry,
        params: typeof row.params_json === 'string'
          ? JSON.parse(row.params_json)
          : row.params_json || {},
        params_json: undefined,
        last_presence_minutes,
      };
    });

    res.json({ ok: true, devices, total, limit, offset });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'devices');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/devices/pending (Zigbee devices not in DB) ──
// ── GET /api/devices/:id ────────────────────────────────
app.get('/api/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const devices = await query(`SELECT * FROM devices WHERE ieee_addr = ? AND ${demoFilter('devices')}`, id);
    if (!devices.length) return res.status(404).json({ ok: false, error: 'Device not found' });

    const device = devices[0];

    // Latest telemetry
    const telemetry = await query(
      `SELECT property, value, unit, ts FROM telemetry WHERE device_ieee = ? ORDER BY ts DESC LIMIT 20`,
      id
    );

    // Recent commands
    const commands = await query(
      `SELECT * FROM commands WHERE device_ieee = ? ORDER BY sent_at DESC LIMIT 10`,
      id
    );

    // State changes
    const stateChanges = await query(
      `SELECT * FROM state_changes WHERE device_ieee = ? ORDER BY ts DESC LIMIT 10`,
      id
    );

    // Stats (last 24h)
    const stats = await query(
      `SELECT property, MIN(value) as min, MAX(value) as max, AVG(value) as avg, COUNT(*) as cnt
       FROM telemetry WHERE device_ieee = ? AND ts >= datetime('now', '-24 hours')
       GROUP BY property`,
      id
    );

    // Motion stats (today)
    let todayActivityMin = null;
    let todaySessions = null;
    if (device.type === 'motion_sensor') {
      const motionRows = await query(
        `SELECT value, ts FROM telemetry
         WHERE device_ieee = ? AND property = 'presence'
           AND ts >= CURRENT_DATE
         ORDER BY ts`,
        id
      );
      if (motionRows.length > 0) {
        // Total minutes with presence=1 today
        let activeMinutes = 0;
        let sessions = 0;
        let inSession = false;
        for (const row of motionRows) {
          if (row.value === 1 && !inSession) { sessions++; inSession = true; }
          else if (row.value === 0 && inSession) { inSession = false; }
        }
        todaySessions = sessions;
        // Count unique minutes where presence=1
        const minuteSet = new Set<number>();
        for (const row of motionRows) {
          if (row.value === 1) {
            const ts = new Date(row.ts).getTime();
            minuteSet.add(Math.floor(ts / 60000));
          }
        }
        todayActivityMin = minuteSet.size;
      }
    }

    res.json({ ok: true, device, telemetry, commands, state_changes: stateChanges, stats, todayActivityMin, todaySessions });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, `device/${req.params.id}`);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/devices/:id/on ────────────────────────────
app.post('/api/devices/:id/on', commandLimiter, async (req, res) => {
  const { id } = req.params;
  try {
    const cmdId = logCommand(id, 'ON', '{}', 'api');
    // MQTT publish будет добавлен после интеграции с Zigbee2MQTT
    // Пока эмулируем успех
    await query(
      `UPDATE commands SET status = 'success', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      cmdId
    );
    logStateChange(id, 'OFF', 'ON', 'api_command');
    res.json({ ok: true, command_id: cmdId, device: id, state: 'ON' });
  } catch (e: any) {
    logErrorWithLog(id, 'command_error', e.message, 'ON');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/devices/:id/off ───────────────────────────
app.post('/api/devices/:id/off', commandLimiter, async (req, res) => {
  const { id } = req.params;
  try {
    const cmdId = logCommand(id, 'OFF', '{}', 'api');
    await query(
      `UPDATE commands SET status = 'success', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      cmdId
    );
    logStateChange(id, 'ON', 'OFF', 'api_command');
    res.json({ ok: true, command_id: cmdId, device: id, state: 'OFF' });
  } catch (e: any) {
    logErrorWithLog(id, 'command_error', e.message, 'OFF');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/devices (create) ────────────────────────────
app.post('/api/devices', async (req, res) => {
  try {
    const { ieee_addr, friendly_name, type, room_id } = req.body;
    if (!ieee_addr || !friendly_name || !type) {
      return res.status(400).json({ ok: false, error: 'ieee_addr, friendly_name, type are required' });
    }
    // Valid types — must match frontend DEVICE_TYPES
    const validTypes = ['light', 'sensor', 'plug', 'gate', 'climate', 'lock',
      'window_sensor', 'door_sensor', 'gate_sensor',
      'air_monitor', 'temp_sensor', 'humid_sensor', 'co2_sensor', 'pm_sensor',
      'motion_sensor', 'presence_sensor',
      'leak_sensor', 'smoke_sensor', 'gas_sensor',
      'light_sensor',
      'switch', 'shutter', 'curtain', 'camera', 'bell', 'speaker',
      'gate_controller', 'cover',
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ ok: false, error: `type must be one of: ${validTypes.join(', ')}` });
    }
    // Validate room exists
    if (room_id) {
      const rooms = await query('SELECT id FROM rooms WHERE id = ?', room_id);
      if (!rooms.length) {
        return res.status(400).json({ ok: false, error: 'Room not found' });
      }
    }
    await query(
      `INSERT INTO devices (ieee_addr, friendly_name, type, room_id, status, last_seen)
       VALUES (?, ?, ?, ?, 'online', datetime('now'))
       ON CONFLICT(ieee_addr) DO UPDATE SET
         friendly_name = EXCLUDED.friendly_name,
         type = EXCLUDED.type,
         room_id = EXCLUDED.room_id,
         last_seen = datetime('now')`,
      ieee_addr, friendly_name, type, Number(room_id) || 1
    );
    res.status(201).json({ ok: true, device: { ieee_addr, friendly_name, type, room_id: Number(room_id) || 1, status: 'online' } });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'devices_create');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── DELETE /api/devices/:id ──────────────────────────────
app.delete('/api/devices/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await query('SELECT * FROM devices WHERE ieee_addr = ?', id);
    if (!existing.length) {
      return res.status(404).json({ ok: false, error: 'Device not found' });
    }
    // Delete related data
    await query('DELETE FROM telemetry WHERE device_ieee = ?', id);
    await query('DELETE FROM commands WHERE device_ieee = ?', id);
    await query('DELETE FROM state_changes WHERE device_ieee = ?', id);
    await query('DELETE FROM climate_setpoints WHERE device_ieee = ?', id);
    await query('DELETE FROM device_group_members WHERE device_ieee = ?', id);
    stmt.deleteDevice.run(id);
    res.json({ ok: true, deleted: id });
  } catch (e: any) {
    logErrorWithLog(id, 'api_error', e.message, 'devices_delete');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── PATCH /api/devices/:id/params (config) ──────────────
const DEVICE_PARAM_SCHEMAS: Record<string, { params: { key: string; control: string; options?: string[]; min?: number; max?: number; step?: number; default: any }[] }> = {
  window_sensor: { params: [] },
  door_sensor: { params: [] },
  presence_sensor: {
    params: [
      { key: 'sensitivity', control: 'select', options: ['Низкая', 'Средняя', 'Высокая'], default: 'Средняя' },
      { key: 'timeoutSec', control: 'slider', min: 10, max: 600, default: 180 },
      { key: 'zoneFilter', control: 'toggle', default: false },
    ],
  },
  motion_sensor: {
    params: [
      { key: 'sensitivity', control: 'select', options: ['Низкая', 'Средняя', 'Высокая'], default: 'Средняя' },
      { key: 'timeoutSec', control: 'slider', min: 5, max: 300, default: 30 },
    ],
  },
  leak_sensor: { params: [{ key: 'alarmSound', control: 'toggle', default: true }] },
  light: {
    params: [
      { key: 'colorTemp', control: 'slider', min: 2700, max: 6500, step: 100, default: 3500 },
      { key: 'powerOnBehavior', control: 'select', options: ['Восстановить состояние', 'Всегда включён', 'Всегда выключен'], default: 'Восстановить состояние' },
    ],
  },
  plug: {
    params: [
      { key: 'childLock', control: 'toggle', default: false },
      { key: 'overloadLimit', control: 'number', min: 500, max: 4000, step: 100, default: 2500 },
    ],
  },
  gate_controller: {
    params: [
      { key: 'autoClose', control: 'toggle', default: true },
      { key: 'autoCloseDelayMin', control: 'slider', min: 1, max: 30, step: 1, default: 5 },
    ],
  },
  climate: {
    params: [
      { key: 'mode', control: 'select', options: ['cool', 'heat', 'fan', 'off'], default: 'cool' },
      { key: 'fanSpeed', control: 'select', options: ['авто', 'низкая', 'средняя', 'высокая'], default: 'авто' },
      { key: 'swing', control: 'toggle', default: false },
    ],
  },
  air_monitor: { params: [{ key: 'reportIntervalSec', control: 'select', options: ['10', '30', '60', '300'], default: '60' }] },
};

function validateParams(type: string, body: Record<string, any>): { errors: { key: string; reason: string; options?: string[] }[]; valid: Record<string, any> } {
  const schema = DEVICE_PARAM_SCHEMAS[type];
  if (!schema || schema.params.length === 0) {
    return { errors: [{ key: '_', reason: 'nothing_to_configure' }], valid: {} };
  }
  const errors: { key: string; reason: string; options?: string[] }[] = [];
  const valid: Record<string, any> = {};
  for (const field of schema.params) {
    if (body[field.key] === undefined) continue;
    const val = body[field.key];
    switch (field.control) {
      case 'toggle':
        if (typeof val !== 'boolean') errors.push({ key: field.key, reason: 'must_be_boolean' });
        else valid[field.key] = val;
        break;
      case 'select':
        if (!field.options!.includes(val)) errors.push({ key: field.key, reason: 'not_in_options', options: field.options });
        else valid[field.key] = val;
        break;
      case 'slider':
      case 'number':
        if (typeof val !== 'number' || (field.min !== undefined && val < field.min) || (field.max !== undefined && val > field.max)) {
          errors.push({ key: field.key, reason: 'out_of_range', options: [`min:${field.min}`, `max:${field.max}`] });
        } else valid[field.key] = val;
        break;
    }
  }
  return { errors, valid };
}

app.patch('/api/devices/:id/params', async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await query('SELECT type FROM devices WHERE ieee_addr = ?', id);
    if (!existing.length) return res.status(404).json({ ok: false, error: 'Device not found' });
    const type = existing[0].type;
    const { errors, valid } = validateParams(type, req.body);
    if (Object.keys(valid).length === 0 && errors.length > 0) {
      if (errors[0].reason === 'nothing_to_configure') return res.status(400).json({ ok: false, error: 'nothing_to_configure' });
      return res.status(422).json({ ok: false, errors });
    }
    if (errors.length > 0) return res.status(422).json({ ok: false, errors, partial: valid });
    // Store params as JSON in a separate table or device row
    // Using a simple params_json column would need migration — store as raw_json pattern
    await query(`UPDATE devices SET params_json = ? WHERE ieee_addr = ?`, JSON.stringify(valid), id);
    res.json({ ok: true, params: valid });
  } catch (e: any) {
    logErrorWithLog(id, 'api_error', e.message, 'devices_params');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── PUT /api/devices/:id (edit) ──────────────────────────
app.put('/api/devices/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { friendly_name, type, room_id } = req.body;
    const existing = await query('SELECT * FROM devices WHERE ieee_addr = ?', id);
    if (!existing.length) {
      return res.status(404).json({ ok: false, error: 'Device not found' });
    }
    const updates: string[] = [];
    const params: any[] = [];
    if (friendly_name !== undefined) { updates.push('friendly_name = ?'); params.push(friendly_name); }
    if (type !== undefined) {
      const validTypes = ['light', 'sensor', 'plug', 'gate', 'climate', 'lock',
        'window_sensor', 'door_sensor', 'gate_sensor',
        'air_monitor', 'temp_sensor', 'humid_sensor', 'co2_sensor', 'pm_sensor',
        'motion_sensor', 'presence_sensor',
        'leak_sensor', 'smoke_sensor', 'gas_sensor',
        'light_sensor',
        'switch', 'shutter', 'curtain', 'camera', 'bell', 'speaker',
      ];
      if (!validTypes.includes(type)) return res.status(400).json({ ok: false, error: `Invalid type: ${type}` });
      updates.push('type = ?'); params.push(type);
    }
    if (room_id !== undefined) {
      if (room_id) {
        const rooms = await query('SELECT id FROM rooms WHERE id = ?', room_id);
        if (!rooms.length) return res.status(400).json({ ok: false, error: 'Room not found' });
      }
      updates.push('room_id = ?'); params.push(room_id);
    }
    if (!updates.length) return res.status(400).json({ ok: false, error: 'No fields to update' });
    updates.push('last_seen = datetime(\'now\')');
    params.push(id);
    await query(`UPDATE devices SET ${updates.join(', ')} WHERE ieee_addr = ?`, ...params);
    const updated = await query('SELECT * FROM devices WHERE ieee_addr = ?', id);
    res.json({ ok: true, device: updated[0] });
  } catch (e: any) {
    logErrorWithLog(id, 'api_error', e.message, 'devices_update');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Zigbee2MQTT helper ──────────────────────────────────
const Z2M_URL = process.env.Z2M_URL || 'http://172.21.0.3:8080';
const Z2M_TOKEN = process.env.Z2M_AUTH_TOKEN || '';

function zigbeeRequest(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (Z2M_TOKEN) headers['Authorization'] = `Bearer ${Z2M_TOKEN}`;
    const req = httpGet(`${Z2M_URL}${path}`, { headers, timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => body += chunk.toString());
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(`Z2M parse error: ${body.slice(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Z2M timeout')); });
  });
}

// ── GET /api/devices/pending (all Z2M devices not yet added) ──────
app.get('/api/devices/pending', async (_req, res) => {
  try {
    let z2mDevices: any[] = [];

    // Read devices from Z2M database.db (NDJSON — newline-delimited JSON)
    try {
      const fs = await import('fs');
      const path = require('path');
      const dbPath = '/home/admingimolost/smart-estate/data/zigbee2mqtt/database.db';
      const content = fs.readFileSync(dbPath, 'utf8');
      const lines = content.trim().split('\n');
      for (const line of lines) {
        try { z2mDevices.push(JSON.parse(line)); } catch { /* skip corrupt lines */ }
      }
    } catch (err: any) {
      logger.error("[API] ", 'Z2M DB read failed:', err.message);
    }

    // Filter to only real devices (skip coordinator)
    const realDevices = z2mDevices.filter((d: any) =>
      d.type && d.type !== 'Coordinator' && d.ieeeAddr
    );

    if (realDevices.length === 0) {
      return res.json({ ok: true, pending: [], reason: 'z2m_unavailable' });
    }

    // Map to our format
    const z2mMapped = realDevices.map((d: any) => ({
      ieee_address: d.ieeeAddr,
      friendly_name: d.friendlyName || d.ieeeAddr,
      model: d.modelId || '—',
      vendor: d.manufName || '—',
      type: mapZ2MTypeToInternal(d.ieeeAddr, d.definition?.exposes),
    }));

    // Filter out devices already in our DB
    const knownDevices = await query(`SELECT ieee_addr FROM devices`);
    const knownSet = new Set(knownDevices.map((r: any) => r.ieee_addr));

    const pending = z2mMapped
      .filter((d: any) => !knownSet.has(d.ieee_address));

    res.json({ ok: true, pending });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'devices_pending');
    res.status(500).json({ ok: false, error: e.message });
  }
});

function mapZ2MTypeToInternal(_ieeeAddr: string, _exposes?: any[]): string {
  // Default to 'sensor' — user can change it when adding
  return 'sensor';
}

// ── Phase 1: Discovery эндпоинты ─────────────────────────────
// POST /api/discovery/start — enable permit_join
app.post('/api/discovery/start', async (_req, res) => {
  try {
    const client = mqtt.connect('mqtt://localhost:1883', {
      clientId: 'smart-estate-discovery-' + Date.now(),
      clean: true,
      connectTimeout: 5000,
    });
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => {
        client.publish('zigbee2mqtt/bridge/request/permit_join', JSON.stringify({ value: true, time: 254 }), { qos: 1 });
        setTimeout(() => { client.end(true); resolve(); }, 300);
      });
      client.on('error', (err: Error) => { client.end(true); reject(err); });
    });
    res.json({ ok: true, permit_join: true, time: 254 });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'discovery_start');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/discovery/stop — disable permit_join
app.post('/api/discovery/stop', async (_req, res) => {
  try {
    const client = mqtt.connect('mqtt://localhost:1883', {
      clientId: 'smart-estate-discovery-' + Date.now(),
      clean: true,
      connectTimeout: 5000,
    });
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => {
        client.publish('zigbee2mqtt/bridge/request/permit_join', JSON.stringify({ value: false }), { qos: 1 });
        setTimeout(() => { client.end(true); resolve(); }, 300);
      });
      client.on('error', (err: Error) => { client.end(true); reject(err); });
    });
    res.json({ ok: true, permit_join: false });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'discovery_stop');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/discovery/events — SSE stream of discovery events
app.get('/api/discovery/events', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send existing pending events first
  try {
    const events = stmt.getDiscoveryEvents.all(50);
    const existing = JSON.stringify({ type: 'existing', events });
    res.write(`data: ${existing}\n\n`);
  } catch {}

  // Poll for new events every 2 seconds
  const discoveryStmt = stmt.getDiscoveryEvents.db
    ? stmt.getDiscoveryEvents.db.prepare('SELECT * FROM discovery_events ORDER BY created_at DESC LIMIT 10')
    : null;
  if (!discoveryStmt) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'DB not available' })}\n\n`);
    res.end();
    return;
  }
  const lastIds = new Set<number>();
  const interval = setInterval(() => {
    try {
      const rows: any[] = discoveryStmt.all();
      if (rows && Array.isArray(rows)) {
        for (const ev of rows) {
          if (!lastIds.has(ev.id)) {
            lastIds.add(ev.id);
            res.write(`data: ${JSON.stringify({ type: 'new', event: ev })}\n\n`);
          }
        }
      }
    } catch (e: any) {
      console.error('discovery SSE poll error:', e.message);
    }
  }, 2000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

// POST /api/discovery/:ieee/confirm — confirm a discovered device
app.post('/api/discovery/:ieee/confirm', async (req, res) => {
  try {
    const { ieee } = req.params;
    const { name, roomId } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: 'name is required' });

    // Upsert device into our DB
    stmt.upsertDevice.run(ieee, name, null, null, 'sensor', roomId || 1);
    // Mark discovery event as confirmed
    stmt.confirmDiscovery.run(ieee);

    // Also rename friendly_name in Z2M via MQTT
    try {
      const mc = mqtt.connect('mqtt://localhost:1883', {
        clientId: 'smart-estate-confirm-' + Date.now(),
        clean: true,
        connectTimeout: 3000,
      });
      await new Promise<void>((resolve, reject) => {
        mc.on('connect', () => {
          mc.publish(`zigbee2mqtt/bridge/request/device/rename`, JSON.stringify({
            from: ieee,
            to: name,
          }), { qos: 1 });
          setTimeout(() => { mc.end(true); resolve(); }, 300);
        });
        mc.on('error', () => { mc.end(true); resolve(); }); // Don't fail if MQTT unavailable
      });
    } catch {}

    res.json({ ok: true, device: { ieee_addr: ieee, friendly_name: name, room_id: roomId || 1 } });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'discovery_confirm');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/rooms (for device creation) ─────────────────
// ── GET /api/telemetry ──────────────────────────────────
app.get('/api/telemetry', async (req, res) => {
  try {
    const device = req.query.device as string;
    const property = req.query.property as string;
    const period = req.query.period as string || '24h';
    const limit = parseInt(req.query.limit as string) || 100;

    let tsFilter: string;
    switch (period) {
      case '1h': tsFilter = "datetime('now', '-1 hours')"; break;
      case '6h': tsFilter = "datetime('now', '-6 hours')"; break;
      case '7d': tsFilter = "datetime('now', '-7 days')"; break;
      case '30d': tsFilter = "datetime('now', '-30 days')"; break;
      default: tsFilter = "datetime('now', '-24 hours')";
    }

    let sql = `SELECT * FROM telemetry WHERE ts >= ${tsFilter}`;
    const params: any[] = [];

    if (device) { sql += ' AND device_ieee = ?'; params.push(device); }
    if (property) { sql += ' AND property = ?'; params.push(property); }
    sql += ' ORDER BY ts DESC LIMIT ?';
    params.push(limit);

    const rows = await query(sql, ...params);
    res.json({ ok: true, telemetry: rows, count: rows.length });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'telemetry');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/rooms ──────────────────────────────────────
app.get('/api/rooms', async (_req, res) => {
  try {
    const rooms = await query(`
      SELECT r.*, COUNT(d.ieee_addr) as device_count
      FROM rooms r LEFT JOIN devices d ON r.id = d.room_id AND ${demoFilter('d')}
      GROUP BY r.id, r.name, r.icon ORDER BY r.id
    `);

    // Enrich with aggregated telemetry per room
    const enriched = await Promise.all(rooms.map(async (room: any) => {
      let avgTemp = null;
      if (room.device_count > 0) {
        try {
          const temp = await query(`
            SELECT AVG(value)||'' as avg_temp FROM telemetry
            WHERE property = 'temperature' AND device_ieee IN (
              SELECT ieee_addr FROM devices WHERE room_id = ?
            ) AND ts >= datetime('now', '-1 hours')
          `, room.id);
          avgTemp = temp[0]?.avg_temp ? parseFloat(temp[0].avg_temp) : null;
        } catch {}
      }
      return { ...room, avg_temperature: avgTemp };
    }));

    res.json({ ok: true, rooms: enriched });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'rooms');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/rooms (create) ──────────────────────────────
app.post('/api/rooms', async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name?.trim()) return res.status(400).json({ ok: false, error: 'name required' });
    const iconKey = icon || 'home';
    // Check duplicate
    const dup = await query('SELECT id FROM rooms WHERE name = ?', name.trim());
    if (dup.length) return res.status(409).json({ ok: false, error: 'Room already exists' });
    // Generate ID
    const max = await query('SELECT COALESCE(MAX(id),0)+1 as next_id FROM rooms');
    const id = Number(max[0].next_id);
    await query('INSERT INTO rooms (id, name, icon) VALUES (?, ?, ?)', id, name.trim(), iconKey);
    const room = await query('SELECT * FROM rooms WHERE id = ?', id);
    res.status(201).json({ ok: true, room: room[0] });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'rooms_create');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── DELETE /api/rooms/:id ─────────────────────────────────
app.delete('/api/rooms/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await query('SELECT * FROM rooms WHERE id = ?', id);
    if (!existing.length) return res.status(404).json({ ok: false, error: 'Room not found' });
    // Move devices to room 1 (default) before deleting
    await query('UPDATE devices SET room_id = 1 WHERE room_id = ?', id);
    await query('DELETE FROM rooms WHERE id = ?', id);
    res.json({ ok: true, deleted: id });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'rooms_delete');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── PATCH /api/rooms/:id (Phase 4) ────────────────────────
app.patch('/api/rooms/:id', async (req, res) => {
  const { id } = req.params;
  const { name, icon } = req.body;
  try {
    const existing = await query('SELECT * FROM rooms WHERE id = ?', id);
    if (!existing.length) return res.status(404).json({ ok: false, error: 'Room not found' });
    if (!name && !icon) return res.status(400).json({ ok: false, error: 'At least one of name or icon is required' });

    const updates: string[] = [];
    const params: any[] = [];
    if (name) { updates.push('name = ?'); params.push(name); }
    if (icon) { updates.push('icon = ?'); params.push(icon); }
    params.push(id);
    await query(`UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`, ...params);

    const room = await query('SELECT * FROM rooms WHERE id = ?', id);
    res.json({ ok: true, room: room[0] });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'rooms_patch');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/rooms/:id/devices ────────────────────────────
app.get('/api/rooms/:id/devices', async (req, res) => {
  const { id } = req.params;
  try {
    // Проверяем, существует ли комната
    const roomCheck = await query('SELECT id FROM rooms WHERE id = ?', id);
    if (!roomCheck.length) {
      return res.status(404).json({ ok: false, error: 'Room not found' });
    }
    const devices = await query(`
      SELECT d.*, r.name as room_name, r.icon as room_icon,
        (SELECT COALESCE(json_group_array(
          json_object('property', t.property, 'value', t.value, 'unit', t.unit)
        ), '[]')
         FROM (SELECT property, value, unit FROM (
               SELECT property, value, unit,
                 ROW_NUMBER() OVER (PARTITION BY property ORDER BY ts DESC) as rn
               FROM telemetry WHERE device_ieee = d.ieee_addr
             ) sub WHERE rn = 1 LIMIT 6) t
        ) as latest_telemetry
      FROM devices d LEFT JOIN rooms r ON d.room_id = r.id
      WHERE d.room_id = ? AND ${demoFilter('d')}
      ORDER BY d.type, d.ieee_addr
    `, id);

    const parsed = devices.map((row: any) => ({
      ...row,
      latest_telemetry: typeof row.latest_telemetry === 'string'
        ? JSON.parse(row.latest_telemetry)
        : row.latest_telemetry || [],
      params: typeof row.params_json === 'string'
        ? JSON.parse(row.params_json)
        : row.params_json || {},
      params_json: undefined,
    }));

    res.json({ ok: true, devices: parsed });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'room_devices');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/rooms/:id/climate ────────────────────────────
app.get('/api/rooms/:id/climate', async (req, res) => {
  const { id } = req.params;
  try {
    const setpoints = await query(`
      SELECT cs.* FROM climate_setpoints cs
      JOIN devices d ON cs.device_ieee = d.ieee_addr
      WHERE d.room_id = ?
      ORDER BY cs.device_ieee
    `, id);

    const enriched = await Promise.all(setpoints.map(async (sp: any) => {
      const temp = await query(
        `SELECT value FROM telemetry WHERE device_ieee = ? AND property = 'temperature'
         ORDER BY ts DESC LIMIT 1`, sp.device_ieee
      );
      const humidity = await query(
        `SELECT value FROM telemetry WHERE device_ieee = ? AND property = 'humidity'
         ORDER BY ts DESC LIMIT 1`, sp.device_ieee
      );
      const currentTemp = temp[0]?.value || null;
      const needsHeat = currentTemp !== null && currentTemp < sp.target_temp - (sp.hysteresis || 1);
      const needsCool = currentTemp !== null && currentTemp > sp.target_temp + (sp.hysteresis || 1);
      return {
        ...sp,
        current_temp: currentTemp,
        needs_heat: needsHeat,
        needs_cool: needsCool,
        action: needsHeat ? 'heat' : needsCool ? 'cool' : 'idle',
      };
    }));
    res.json({ ok: true, climate: enriched });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'room_climate');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/energy ─────────────────────────────────────
app.get('/api/energy', async (_req, res) => {
  try {
    const today = await query(
      `SELECT SUM(value) as kwh FROM telemetry
       WHERE property = 'energy' AND ts >= CURRENT_DATE`
    );
    const current = await query(
      `SELECT t.device_ieee, t.value FROM telemetry t
       INNER JOIN (SELECT device_ieee, MAX(ts) as max_ts FROM telemetry
         WHERE property = 'power' GROUP BY device_ieee) latest
       ON t.device_ieee = latest.device_ieee AND t.ts = latest.max_ts
       WHERE t.property = 'power'`
    );
    const totalWatts = current.reduce((sum: number, r: any) => sum + (r.value || 0), 0);

    res.json({
      ok: true,
      current_watts: totalWatts,
      today_kwh: today[0]?.kwh || 0,
      devices: current,
    });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'energy');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/energy/trend ────────────────────────────────
app.get('/api/energy/trend', async (_req, res) => {
  try {
    // Почасовые срезы энергопотребления за последние 24 часа
    const rows = await query(`
      SELECT
        strftime('%Y-%m-%dT%H:00:00Z', ts) as hour,
        SUM(CASE WHEN property = 'power' THEN value ELSE 0 END) as total_power,
        COUNT(DISTINCT device_ieee) as device_count
      FROM telemetry
      WHERE ts >= datetime('now', '-24 hours')
        AND (property = 'power' OR property = 'energy')
      GROUP BY strftime('%Y-%m-%dT%H:00:00Z', ts)
      ORDER BY hour
    `);

    // Заполняем все 24 часа (если нет данных — ставим 0)
    const now = new Date();
    const trend: { hour: string; power: number; devices: number }[] = [];
    for (let i = 23; i >= 0; i--) {
      const h = new Date(now.getTime() - i * 3600_000);
      const hStr = h.toISOString().slice(0, 13) + ':00:00Z';
      const match = rows.find((r: any) => {
        const rStr = typeof r.hour === 'string'
          ? r.hour.slice(0, 13) + ':00:00Z'
          : new Date(r.hour).toISOString().slice(0, 13) + ':00:00Z';
        return rStr === hStr;
      });
      trend.push({
        hour: hStr,
        power: match ? match.total_power : 0,
        devices: match ? match.device_count : 0,
      });
    }

    res.json({ ok: true, trend });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'energy_trend');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Climate Setpoints ────────────────────────────────────

app.get('/api/climate', async (_req, res) => {
  try {
    const setpoints = await query('SELECT * FROM climate_setpoints ORDER BY device_ieee');
    const enriched = await Promise.all(setpoints.map(async (sp: any) => {
      const temp = await query(
        `SELECT value FROM telemetry WHERE device_ieee = ? AND property = 'temperature'
         ORDER BY ts DESC LIMIT 1`, sp.device_ieee
      );
      const humidity = await query(
        `SELECT value FROM telemetry WHERE device_ieee = ? AND property = 'humidity'
         ORDER BY ts DESC LIMIT 1`, sp.device_ieee
      );
      const currentTemp = temp[0]?.value || null;
      const currentHumidity = humidity[0]?.value || null;
      const needsHeat = currentTemp !== null && currentTemp < sp.target_temp - sp.hysteresis;
      const needsCool = currentTemp !== null && currentTemp > sp.target_temp + sp.hysteresis;
      return {
        ...sp,
        current_temp: currentTemp,
        current_humidity: currentHumidity,
        needs_heat: needsHeat,
        needs_cool: needsCool,
        action: needsHeat ? 'heat' : needsCool ? 'cool' : 'idle',
      };
    }));
    res.json({ ok: true, rooms: enriched });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'climate');
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/climate/:device_ieee', async (req, res) => {
  try {
    const sp = await query('SELECT * FROM climate_setpoints WHERE device_ieee = ?', req.params.device_ieee);
    if (!sp.length) return res.status(404).json({ ok: false, error: 'Setpoint not found' });
    res.json({ ok: true, setpoint: sp[0] });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'climate_get');
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/climate/:device_ieee', async (req, res) => {
  try {
    const { target_temp, mode, hysteresis, min_temp, max_temp, schedule_json } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    if (target_temp !== undefined) { updates.push('target_temp = ?'); params.push(target_temp); }
    if (mode !== undefined) { updates.push('mode = ?'); params.push(mode); }
    if (hysteresis !== undefined) { updates.push('hysteresis = ?'); params.push(hysteresis); }
    if (min_temp !== undefined) { updates.push('min_temp = ?'); params.push(min_temp); }
    if (max_temp !== undefined) { updates.push('max_temp = ?'); params.push(max_temp); }
    if (schedule_json !== undefined) { updates.push('schedule_json = ?'); params.push(schedule_json); }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(req.params.device_ieee);
      await query(
        `UPDATE climate_setpoints SET ${updates.join(', ')} WHERE device_ieee = ?`,
        ...params
      );
    }

    const sp = await query('SELECT * FROM climate_setpoints WHERE device_ieee = ?', req.params.device_ieee);
    res.json({ ok: true, setpoint: sp[0] || null });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'climate_update');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Gates / Access Control ───────────────────────────────

app.get('/api/gates', async (_req, res) => {
  try {
    const gates = await query("SELECT ieee_addr, friendly_name, status FROM devices WHERE type IN ('gate','lock') ORDER BY friendly_name");
    res.json({ ok: true, gates });
  } catch { res.json({ ok: true, gates: [] }); }
});

app.post('/api/gates/:id/open', commandLimiter, async (req, res) => {
  try {
    const cmdId = logCommand(req.params.id, 'OPEN', '{}', 'gate_api');
    await query("INSERT INTO gate_access_log (id,device_ieee,action,source,details) VALUES (NULL,?,?,?,?)",
      req.params.id, 'open', 'api', req.body.reason || null);
    await query("UPDATE commands SET status='success',completed_at=CURRENT_TIMESTAMP WHERE id=?", cmdId);
    logStateChange(req.params.id, 'closed', 'open', 'gate_api');
    // In demo mode, update device state
    await toggleDemoDevice(req.params.id, 'ON').catch(() => {});
    res.json({ ok: true, device: req.params.id, state: 'open', command_id: cmdId });
  } catch (e: any) {
    logErrorWithLog(req.params.id, 'gate_error', e.message, 'open');
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/gates/:id/close', commandLimiter, async (req, res) => {
  try {
    const cmdId = logCommand(req.params.id, 'CLOSE', '{}', 'gate_api');
    await query("INSERT INTO gate_access_log (id,device_ieee,action,source,details) VALUES (NULL,?,?,?,?)",
      req.params.id, 'close', 'api', req.body.reason || null);
    await query("UPDATE commands SET status='success',completed_at=CURRENT_TIMESTAMP WHERE id=?", cmdId);
    logStateChange(req.params.id, 'open', 'closed', 'gate_api');
    // In demo mode, update device state
    await toggleDemoDevice(req.params.id, 'OFF').catch(() => {});
    res.json({ ok: true, device: req.params.id, state: 'closed', command_id: cmdId });
  } catch (e: any) {
    logErrorWithLog(req.params.id, 'gate_error', e.message, 'close');
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/gates/access-log', async (req, res) => {
  try {
    const device = req.query.device as string;
    const limit = parseInt(req.query.limit as string) || 50;
    let sql = 'SELECT * FROM gate_access_log';
    const params: any[] = [];
    if (device) { sql += ' WHERE device_ieee = ?'; params.push(device); }
    sql += ' ORDER BY ts DESC LIMIT ?'; params.push(limit);
    const rows = await query(sql, ...params);
    res.json({ ok: true, log: rows, count: rows.length });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'access_log');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/events ─────────────────────────────────────
app.get('/api/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const errors = await query(`SELECT * FROM errors ORDER BY ts DESC LIMIT ?`, limit);
    const commands = await query(`SELECT * FROM commands ORDER BY sent_at DESC LIMIT ?`, limit);
    const stateChanges = await query(`SELECT * FROM state_changes ORDER BY ts DESC LIMIT ?`, limit);

    res.json({ ok: true, errors, commands, state_changes: stateChanges });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'events');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/scenarios ──────────────────────────────────
app.get('/api/scenarios', async (_req, res) => {
  try {
    const rows = await query(`SELECT * FROM scenarios ORDER BY id`);
    res.json({ ok: true, scenarios: rows });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'scenarios');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/scenarios/:id/toggle ──────────────────────
app.post('/api/scenarios/:id/toggle', commandLimiter, async (req, res) => {
  try {
    await query(`UPDATE scenarios SET active = NOT active WHERE id = ?`, req.params.id);
    const s = await query(`SELECT * FROM scenarios WHERE id = ?`, req.params.id);
    res.json({ ok: true, scenario: s[0] });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'scenario_toggle');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/scenarios ─────────────────────────────────
app.post('/api/scenarios', async (req, res) => {
  try {
    const { name, description, triggers_json, actions_json, schedule_json, active } = req.body;
    if (!name || !triggers_json || !actions_json) {
      return res.status(400).json({ ok: false, error: 'name, triggers_json, actions_json required' });
    }

    const maxId = await query('SELECT COALESCE(MAX(id),0)+1 as next_id FROM scenarios');
    const id = maxId[0].next_id;

    await query(
      `INSERT INTO scenarios (id, name, description, triggers_json, actions_json, schedule_json, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, name, description || null, triggers_json, actions_json,
      schedule_json || null,
      active !== undefined ? (active ? 1 : 0) : 1
    );

    // Reload both engine and scheduler
    import('./engine').then(m => m.reloadScenarios()).catch(() => {});
    import('./scheduler').then(m => m.reloadScheduledScenarios()).catch(() => {});

    const s = await query('SELECT * FROM scenarios WHERE id = ?', id);
    res.status(201).json({ ok: true, scenario: s[0] });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'scenario_create');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── PUT /api/scenarios/:id ──────────────────────────────
app.put('/api/scenarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, triggers_json, actions_json, schedule_json, active } = req.body;

    const existing = await query('SELECT * FROM scenarios WHERE id = ?', id);
    if (!existing.length) {
      return res.status(404).json({ ok: false, error: 'Scenario not found' });
    }

    const updates: string[] = [];
    const params: any[] = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (triggers_json !== undefined) { updates.push('triggers_json = ?'); params.push(triggers_json); }
    if (actions_json !== undefined) { updates.push('actions_json = ?'); params.push(actions_json); }
    if (schedule_json !== undefined) { updates.push('schedule_json = ?'); params.push(schedule_json); }
    if (active !== undefined) { updates.push('active = ?'); params.push(active); }

    if (updates.length > 0) {
      params.push(id);
      await query(`UPDATE scenarios SET ${updates.join(', ')} WHERE id = ?`, ...params);
      import('./engine').then(m => m.reloadScenarios()).catch(() => {});
      import('./scheduler').then(m => m.reloadScheduledScenarios()).catch(() => {});
    }

    const s = await query('SELECT * FROM scenarios WHERE id = ?', id);
    res.json({ ok: true, scenario: s[0] });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'scenario_update');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── DELETE /api/scenarios/:id ────────────────────────────
app.delete('/api/scenarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT * FROM scenarios WHERE id = ?', id);
    if (!existing.length) {
      return res.status(404).json({ ok: false, error: 'Scenario not found' });
    }

    await query('DELETE FROM scenario_executions WHERE scenario_id = ?', id);
    await query('DELETE FROM scenarios WHERE id = ?', id);

    import('./engine').then(m => m.reloadScenarios()).catch(() => {});

    res.json({ ok: true, deleted: id });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'scenario_delete');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/scenarios/:id/executions ────────────────────
app.get('/api/scenarios/:id/executions', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const rows = await query(
      'SELECT * FROM scenario_executions WHERE scenario_id = ? ORDER BY ts DESC LIMIT ?',
      id, limit
    );
    res.json({ ok: true, scenario_id: id, executions: rows, count: rows.length });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'scenario_executions');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Device Groups ─────────────────────────────────────────

// GET /api/groups
app.get('/api/groups', async (_req, res) => {
  try {
    const groups = await query(`
      SELECT g.*, COUNT(gm.device_ieee) as device_count
      FROM device_groups g LEFT JOIN device_group_members gm ON g.id = gm.group_id
      GROUP BY g.id, g.name, g.type, g.icon ORDER BY g.id
    `);
    res.json({ ok: true, groups });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'groups');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/groups/:id
app.get('/api/groups/:id', async (req, res) => {
  try {
    const group = await query('SELECT * FROM device_groups WHERE id = ?', req.params.id);
    if (!group.length) return res.status(404).json({ ok: false, error: 'Group not found' });

    const members = await query(
      `SELECT d.*, r.name as room_name FROM device_group_members gm
       JOIN devices d ON gm.device_ieee = d.ieee_addr
       LEFT JOIN rooms r ON d.room_id = r.id
       WHERE gm.group_id = ?`,
      req.params.id
    );
    res.json({ ok: true, group: group[0], members, count: members.length });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'group_detail');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/groups/:id/add-device
app.post('/api/groups/:id/add-device', commandLimiter, async (req, res) => {
  try {
    const { device_ieee } = req.body;
    if (!device_ieee) return res.status(400).json({ ok: false, error: 'device_ieee required' });

    await query(
      'INSERT OR IGNORE INTO device_group_members (group_id, device_ieee) VALUES (?, ?)',
      req.params.id, device_ieee
    );
    res.json({ ok: true, group_id: req.params.id, device_ieee });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'add_device_to_group');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/groups/:id/remove-device
app.post('/api/groups/:id/remove-device', commandLimiter, async (req, res) => {
  try {
    const { device_ieee } = req.body;
    await query(
      'DELETE FROM device_group_members WHERE group_id = ? AND device_ieee = ?',
      req.params.id, device_ieee
    );
    res.json({ ok: true, group_id: req.params.id, device_ieee });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'remove_device_from_group');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/groups/:id/all-on — включить всю группу
app.post('/api/groups/:id/all-on', commandLimiter, async (req, res) => {
  try {
    const members = await query(
      'SELECT device_ieee FROM device_group_members WHERE group_id = ?', req.params.id
    );
    let fired = 0;
    for (const m of members) {
      const cmdId = logCommand(m.device_ieee, 'ON', '{}', 'group_command');
      await query("UPDATE commands SET status='success',completed_at=CURRENT_TIMESTAMP WHERE id=?", cmdId);
      logStateChange(m.device_ieee, 'OFF', 'ON', `group:${req.params.id}`);
      fired++;
    }
    res.json({ ok: true, group_id: req.params.id, devices_controlled: fired });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'group_all_on');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/groups/:id/all-off
app.post('/api/groups/:id/all-off', commandLimiter, async (req, res) => {
  try {
    const members = await query(
      'SELECT device_ieee FROM device_group_members WHERE group_id = ?', req.params.id
    );
    let fired = 0;
    for (const m of members) {
      const cmdId = logCommand(m.device_ieee, 'OFF', '{}', 'group_command');
      await query("UPDATE commands SET status='success',completed_at=CURRENT_TIMESTAMP WHERE id=?", cmdId);
      logStateChange(m.device_ieee, 'ON', 'OFF', `group:${req.params.id}`);
      fired++;
    }
    res.json({ ok: true, group_id: req.params.id, devices_controlled: fired });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'group_all_off');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/audit (полный лог для AI-анализа) ──────────
app.get('/api/audit', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const device = req.query.device as string;

    let cmdWhere = '';
    let errWhere = '';
    let stateWhere = '';
    const params: any[] = [];

    if (device) {
      cmdWhere = ' WHERE device_ieee = ?';
      errWhere = ' WHERE device_ieee = ?';
      stateWhere = ' WHERE device_ieee = ?';
      params.push(device, device, device);
    }

    const commands = await query(
      `SELECT * FROM commands ${cmdWhere} ORDER BY sent_at DESC LIMIT ?`,
      ...(device ? [device, limit] : [limit])
    );
    const errors = await query(
      `SELECT * FROM errors ${errWhere} ORDER BY ts DESC LIMIT ?`,
      ...(device ? [device, limit] : [limit])
    );
    const stateChanges = await query(
      `SELECT * FROM state_changes ${stateWhere} ORDER BY ts DESC LIMIT ?`,
      ...(device ? [device, limit] : [limit])
    );

    res.json({
      ok: true,
      device,
      commands,
      errors,
      state_changes: stateChanges,
      summary: {
        total_commands: commands.length,
        total_errors: errors.length,
        error_rate: commands.length > 0
          ? ((errors.length / commands.length) * 100).toFixed(1) + '%'
          : '0%',
      },
    });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'audit');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/dashboard ─────────────────────────────────
// Aggregated endpoint for the frontend dashboard
app.get('/api/dashboard', async (_req, res) => {
  try {
    // Auto-active status
    const autoActive = true;

    // Next scheduled event
    const nextScenario = await query(
      `SELECT name, schedule_json FROM scenarios WHERE active = true ORDER BY id LIMIT 1`
    );
    const nextEvent = nextScenario[0]?.name
      ? `Выключить свет в 22:30` // simplified, real one would parse schedule_json
      : 'Нет активных событий';

    // Security: check if any door sensors report open
    const doors = await query(
      `SELECT t.device_ieee, d.friendly_name FROM telemetry t
       JOIN devices d ON t.device_ieee = d.ieee_addr
       WHERE t.property = 'contact' AND t.value > 0
       AND t.ts >= datetime('now', '-1 minutes')
       AND ${demoFilter('d')}`
    );
    const security = {
      armed: doors.length === 0,
      openPoints: doors.map((d: any) => d.friendly_name),
    };

    // Rooms with temperature — only rooms that have at least one non-demo device
    const rooms = await query(`
      SELECT r.id, r.name, r.icon
      FROM rooms r
      JOIN devices d ON d.room_id = r.id AND ${demoFilter('d')}
      GROUP BY r.id, r.name, r.icon
      ORDER BY r.id
    `);

    const enriched = await Promise.all(rooms.map(async (room: any) => {
      const temp = await query(
        `SELECT AVG(value) as temp FROM telemetry
         WHERE property = 'temperature' AND device_ieee IN (
           SELECT ieee_addr FROM devices WHERE room_id = ? AND ${demoFilter('devices')}
         ) AND ts >= datetime('now', '-1 hours')`,
        room.id
      );
      const light = await query(
        `SELECT d.ieee_addr FROM devices d
         JOIN telemetry t ON d.ieee_addr = t.device_ieee
         WHERE d.room_id = ? AND d.type = 'light' AND t.property = 'state' AND t.value > 0
         AND t.ts >= datetime('now', '-5 minutes')
         AND ${demoFilter('d')}`,
        room.id
      );
      return {
        id: String(room.id),
        name: room.name,
        icon: room.icon || '🏠',
        temperature: temp[0]?.temp || null,
        lightOn: light.length > 0,
        status: 'auto',
      };
    }));

    // Energy
    const energyData = await query(
      `SELECT AVG(value) as val, CAST(strftime('%H', ts) AS INTEGER) as h FROM telemetry
       WHERE property = 'power' AND ts >= datetime('now', '-24 hours')
       GROUP BY h ORDER BY h`
    );
    const energyTrend = Array(24).fill(0);
    energyData.forEach((r: any) => { energyTrend[Number(r.h)] = r.val; });
    const totalEnergy = energyTrend.reduce((a: number, b: number) => a + b, 0) / 1000; // W → kWh, rough

    res.json({
      ok: true,
      autoActive,
      nextEvent,
      security,
      rooms: enriched,
      todayEnergy: +totalEnergy.toFixed(1),
      energyTrend,
    });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'dashboard');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Demo Mode ───────────────────────────────────────────
app.get('/api/mode', (_req, res) => {
  try {
    res.json({ ok: true, mode: isDemoMode() ? 'demo' : 'live' });
  } catch {
    res.json({ ok: true, mode: 'live' });
  }
});

app.post('/api/mode', async (req, res) => {
  try {
    const { mode } = req.body;
    if (!mode || !['demo', 'live'].includes(mode)) {
      return res.status(400).json({ ok: false, error: 'mode must be "demo" or "live"' });
    }

    const demo = await import('./demo');
    const mqtt = await import('./mqtt-ws');

    if (mode === 'demo') {
      mqtt.disconnectMQTT();
      await demo.startDemo();
      return res.json({ ok: true, mode: 'demo', message: 'Демо-режим активирован. Датчики симулируются.' });
    } else {
      demo.stopDemo();
      mqtt.connectMQTT();
      return res.json({ ok: true, mode: 'live', message: 'Режим реальных устройств.' });
    }
  } catch (e: any) {
    logger.error("[API] ", 'Mode switch error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/demo/seed', async (_req, res) => {
  try {
    const demo = await import('./demo');
    const result = await demo.seedDemoData();
    res.json({ ok: true, ...result, message: 'Демо-данные загружены' });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/demo/devices/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { state } = req.body; // 'ON' | 'OFF'
    const demo = await import('./demo');
    const ok = await demo.toggleDemoDevice(id, state);
    if (!ok) return res.status(404).json({ ok: false, error: 'Device not found in demo' });
    res.json({ ok: true, device: id, state });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Serve SPA for root AND /start ──
// Serve root-level static files (favicon, icons.svg, manifest, sw, workbox)
app.use(express.static(clientDist));

// HTML shell: NO cache — disable caching temporarily for debugging
function serveIndex(_req: express.Request, res: express.Response) {
  res.set('Cache-Control', 'no-store');
  res.sendFile(join(clientDist, 'index.html'));
}
app.get('/', serveIndex);
app.get('/start', serveIndex);

// ── Design prototype ────────────────────────────────────
app.get('/design', (_req, res) => {
  res.sendFile(join(__dirname, '..', '..', 'design', 'prototype.html'));
});

// ── Client debug logs ────────────────────────────────────
// Ring buffer — stores last 2000 log entries from all clients
const clientLogBuffer: any[] = [];
const MAX_CLIENT_LOGS = 2000;

// POST /api/client-logs — receive logs from the PWA
app.post('/api/client-logs', (req, res) => {
  try {
    const { logs, ua, screen, dpr } = req.body;
    if (!Array.isArray(logs)) {
      return res.status(400).json({ ok: false, error: 'logs array required' });
    }
    const batch = {
      received: new Date().toISOString(),
      client_ip: req.ip || req.socket.remoteAddress,
      ua: ua || 'unknown',
      screen: screen || 'unknown',
      dpr: dpr || 1,
      logs: logs.slice(-500),
    };
    clientLogBuffer.push(batch);
    if (clientLogBuffer.length > MAX_CLIENT_LOGS) clientLogBuffer.shift();

    // Print errors/warnings to server console for quick debugging
    const errors = logs.filter((l: any) => l.level === 'error');
    const warns = logs.filter((l: any) => l.level === 'warn');
    if (errors.length > 0) {
      logger.log("[API] ", `🐛 [CLIENT] ${errors.length} errors, ${warns.length} warnings from ${ua?.slice(0, 60) || 'unknown'}`);
      for (const e of errors.slice(0, 5)) {
        logger.log("[API] ", `   ❌ ${e.message}${e.detail ? ' — ' + e.detail : ''}`);
      }
    }
    if (warns.length > 0) {
      for (const w of warns.slice(0, 3)) {
        logger.log("[API] ", `   ⚠️ ${w.message}${w.detail ? ' — ' + w.detail : ''}`);
      }
    }

    res.json({ ok: true, count: logs.length, stored: clientLogBuffer.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/client-logs — read stored client logs (for debugging)
app.get('/api/client-logs', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const recent = clientLogBuffer.slice(-limit);
  res.json({ ok: true, batches: recent, total: clientLogBuffer.length });
});

// ── Phase 2: AI-провайдеры (BYOK) ────────────────────────────
// POST /api/ai/providers — сохранить провайдера
const aiProvidersRateLimit = rateLimit({
  windowMs: 60_000, max: 20,
  message: { ok: false, error: 'Too many requests' },
});
app.post('/api/ai/providers', aiProvidersRateLimit, async (req, res) => {
  try {
    const { provider, token, baseUrl, model } = req.body;
    if (!provider || !token) {
      return res.status(400).json({ ok: false, error: 'provider and token are required' });
    }
    if (!['anthropic', 'openai', 'openrouter', 'ollama'].includes(provider)) {
      return res.status(400).json({ ok: false, error: 'Invalid provider. Use: anthropic, openai, openrouter, ollama' });
    }

    const id = 'ai-' + Date.now();
    const maskedToken = token.length > 8
      ? token.slice(0, 3) + '…' + token.slice(-4)
      : '***';

    // Simple AES-like obfuscation for at-rest storage (not real crypto — for production use crypto.ts)
    const encoded = Buffer.from(token).toString('base64');
    const tokenEnc = encoded; // In production would be AES-256-GCM

    await query(
      'INSERT INTO ai_providers (id, provider, token_enc, base_url, model, status) VALUES (?, ?, ?, ?, ?, ?)',
      id, provider, tokenEnc, baseUrl || null, model || null, 'configured'
    );

    res.status(201).json({
      ok: true, provider: {
        id, provider, model: model || null, base_url: baseUrl || null,
        maskedToken, status: 'configured',
      }
    });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'ai_providers_create');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/ai/providers — список провайдеров
app.get('/api/ai/providers', async (_req, res) => {
  try {
    const providers = await query('SELECT id, provider, base_url, model, use_in_scenarios, status, created_at FROM ai_providers ORDER BY created_at DESC');
    // Masked representation (no token)
    const list = providers.map((p: any) => ({
      ...p,
      maskedToken: '***', // token never returned
    }));
    res.json({ ok: true, providers: list });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'ai_providers_list');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/ai/providers/:id/test — тестовый вызов
app.post('/api/ai/providers/:id/test', aiProvidersRateLimit, async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT * FROM ai_providers WHERE id = ?', id);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Provider not found' });

    const prov = rows[0];
    const token = Buffer.from(prov.token_enc, 'base64').toString();

    // Simple test call based on provider type
    let testOk = false;
    try {
      if (prov.provider === 'ollama') {
        const url = prov.base_url || 'http://localhost:11434';
        const resp = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
        testOk = resp.ok;
      } else {
        // OpenAI-compatible
        const baseUrl = prov.base_url || 'https://api.openai.com/v1';
        const resp = await fetch(`${baseUrl}/models`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        });
        testOk = resp.ok;
      }
    } catch {
      testOk = false;
    }

    const status = testOk ? 'connected' : 'error';
    await query('UPDATE ai_providers SET status = ? WHERE id = ?', status, id);
    res.json({ ok: true, id, status, test_ok: testOk });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'ai_providers_test');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PATCH /api/ai/providers/:id — обновление настроек
app.patch('/api/ai/providers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { model, useInScenarios, baseUrl } = req.body;
    const existing = await query('SELECT * FROM ai_providers WHERE id = ?', id);
    if (!existing.length) return res.status(404).json({ ok: false, error: 'Provider not found' });

    const updates: string[] = [];
    const params: any[] = [];
    if (model !== undefined) { updates.push('model = ?'); params.push(model); }
    if (useInScenarios !== undefined) { updates.push('use_in_scenarios = ?'); params.push(useInScenarios ? 1 : 0); }
    if (baseUrl !== undefined) { updates.push('base_url = ?'); params.push(baseUrl); }
    if (updates.length === 0) return res.status(400).json({ ok: false, error: 'No fields to update' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    await query(`UPDATE ai_providers SET ${updates.join(', ')} WHERE id = ?`, ...params);

    const updated = await query('SELECT id, provider, base_url, model, use_in_scenarios, status FROM ai_providers WHERE id = ?', id);
    res.json({ ok: true, provider: updated[0] });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'ai_providers_patch');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE /api/ai/providers/:id
app.delete('/api/ai/providers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT * FROM ai_providers WHERE id = ?', id);
    if (!existing.length) return res.status(404).json({ ok: false, error: 'Provider not found' });

    await query('DELETE FROM ai_providers WHERE id = ?', id);
    res.json({ ok: true, deleted: id });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'ai_providers_delete');
    res.status(500).json({ ok: false, error: e.message });
  }
});
app.post('/api/voice', commandLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ ok: false, error: 'text required' });
    }

    const cmd = text.toLowerCase().trim();
    
    // Load all devices, rooms, scenarios for matching
    const [devices, rooms, scenarios] = await Promise.all([
      query('SELECT ieee_addr, friendly_name, type, room_id FROM devices'),
      query('SELECT id, name FROM rooms'),
      query('SELECT id, name, active FROM scenarios'),
    ]);

    // Smart match: find by stem (first 5+ chars in common)
    const matchName = (haystack: string, needle: string): boolean => {
      const h = haystack.toLowerCase();
      const n = needle.toLowerCase();
      // Exact substring match
      if (h.includes(n) || n.includes(h)) return true;
      // Stem match: first 5 chars
      if (h.length >= 5 && n.length >= 5 && h.slice(0, 5) === n.slice(0, 5)) return true;
      // Stem match: first 4 chars
      if (h.length >= 4 && n.length >= 4 && h.slice(0, 4) === n.slice(0, 4)) return true;
      return false;
    };

    const findDevice = (name: string) =>
      devices.find((d: any) => matchName(d.friendly_name, name));
    const findRoom = (name: string) =>
      rooms.find((r: any) => matchName(r.name, name));
    const findScenario = (name: string) =>
      scenarios.find((s: any) => matchName(s.name, name));

    // ── Pattern: включи/выключи [устройство] ──
    const onOffMatch = cmd.match(/^(включи|выключи)\s+(.+)$/);
    if (onOffMatch) {
      const action = onOffMatch[1] === 'включи' ? 'ON' : 'OFF';
      const target = onOffMatch[2];

      // "свет в гостиной" / "свет на кухне"
      const roomLightMatch = target.match(/свет\s+(?:в|на)\s+(.+)/);
      if (roomLightMatch) {
        const room = findRoom(roomLightMatch[1]);
        if (room) {
          const roomDevices = devices.filter((d: any) => d.room_id === room.id && d.type === 'light');
          if (roomDevices.length > 0) {
            for (const d of roomDevices) {
              await logCommand(d.ieee_addr, action, '{}', 'voice');
              await logStateChange(d.ieee_addr, action === 'ON' ? 'OFF' : 'ON', action, 'voice');
            }
            return res.json({ ok: true, text, action: `${action === 'ON' ? 'Включил' : 'Выключил'} свет в ${room.name} (${roomDevices.length} шт.)` });
          }
        }
      }

      // Direct device name
      let device = findDevice(target);
      // Fallback: "ворота" → any gate, "дверь" → any lock
      if (!device && (target.includes('ворот') || target.includes('калитк'))) {
        device = devices.find((d: any) => d.type === 'gate');
      }
      if (!device && target.includes('двер')) {
        device = devices.find((d: any) => d.type === 'lock');
      }
      if (device) {
        // For gates: open/close instead of on/off
        if (device.type === 'gate' || device.type === 'lock') {
          const gateCmd = action === 'ON' ? 'open' : 'close';
          await logCommand(device.ieee_addr, gateCmd, '{}', 'voice');
          await logStateChange(device.ieee_addr, action === 'ON' ? 'closed' : 'open', action === 'ON' ? 'open' : 'closed', 'voice');
          return res.json({ ok: true, text, action: `${action === 'ON' ? 'Открыл' : 'Закрыл'} ${device.friendly_name}` });
        }
        // For lights and plugs
        await logCommand(device.ieee_addr, action, '{}', 'voice');
        await logStateChange(device.ieee_addr, action === 'ON' ? 'OFF' : 'ON', action, 'voice');
        return res.json({ ok: true, text, action: `${action === 'ON' ? 'Включил' : 'Выключил'} ${device.friendly_name}` });
      }

      return res.json({ ok: false, text, action: `Не нашёл устройство «${target}»` });
    }

    // ── Pattern: открой/закрой [ворота/калитку/дверь] ──
    const gateMatch = cmd.match(/^(открой|закрой)\s+(.+)$/);
    if (gateMatch) {
      const action = gateMatch[1] === 'открой' ? 'open' : 'close';
      const target = gateMatch[2];
      let device = findDevice(target);
      // If no exact match, try: "ворота" → any gate, "дверь" → any lock
      if (!device && (target.includes('ворот') || target.includes('калитк'))) {
        device = devices.find((d: any) => d.type === 'gate');
      }
      if (!device && target.includes('двер')) {
        device = devices.find((d: any) => d.type === 'lock');
      }
      if (device && (device.type === 'gate' || device.type === 'lock')) {
        await logCommand(device.ieee_addr, action, '{}', 'voice');
        await logStateChange(device.ieee_addr, action === 'open' ? 'closed' : 'open', action === 'open' ? 'open' : 'closed', 'voice');
        return res.json({ ok: true, text, action: `${gateMatch[1] === 'открой' ? 'Открыл' : 'Закрыл'} ${device.friendly_name}` });
      }
      return res.json({ ok: false, text, action: `Не нашёл ворота/замок «${target}»` });
    }

    // ── Pattern: какая температура в/на [комнате] ──
    const tempMatch = cmd.match(/температур[аы]\s+(?:в|на)\s+(.+)/);
    if (tempMatch) {
      const room = findRoom(tempMatch[1]);
      if (room) {
        const temps = await query(
          `SELECT t.value, t.unit FROM telemetry t
           JOIN devices d ON d.ieee_addr = t.device_ieee
           WHERE d.room_id = ? AND t.property = 'temperature'
           ORDER BY t.ts DESC LIMIT 1`,
          room.id
        );
        if (temps.length > 0) {
          return res.json({ ok: true, text, action: `В ${room.name}: ${temps[0].value}${temps[0].unit || '°C'}` });
        }
      }
      return res.json({ ok: false, text, action: `Нет данных о температуре` });
    }

    // ── Pattern: запусти/останови сценарий [name] ──
    const scenarioMatch = cmd.match(/(?:запусти|останови|включи сценарий|выключи сценарий)\s+(.+)/);
    if (scenarioMatch) {
      const activate = cmd.startsWith('запусти') || cmd.startsWith('включи сценарий');
      const scenario = findScenario(scenarioMatch[1]);
      if (scenario) {
        await query('UPDATE scenarios SET active = ? WHERE id = ?', activate ? 1 : 0, scenario.id);
        import('./engine').then(m => m.reloadScenarios()).catch(() => {});
        import('./scheduler').then(m => m.reloadScheduledScenarios()).catch(() => {});
        return res.json({ ok: true, text, action: `${activate ? 'Запустил' : 'Остановил'} сценарий «${scenario.name}»` });
      }
      return res.json({ ok: false, text, action: `Не нашёл сценарий «${scenarioMatch[1]}»` });
    }

    // ── Pattern: что с [устройством] / статус ──
    const statusMatch = cmd.match(/(?:что с|статус)\s+(.+)/);
    if (statusMatch) {
      const device = findDevice(statusMatch[1]);
      if (device) {
        const tel = await query(
          `SELECT property, value, unit FROM telemetry WHERE device_ieee = ? ORDER BY ts DESC LIMIT 3`,
          device.ieee_addr
        );
        if (tel.length > 0) {
          const parts = tel.map((t: any) => `${t.property}=${t.value}${t.unit || ''}`);
          return res.json({ ok: true, text, action: `${device.friendly_name}: ${parts.join(', ')}` });
        }
        return res.json({ ok: true, text, action: `${device.friendly_name}: нет данных` });
      }
      const room = findRoom(statusMatch[1]);
      if (room) {
        const tel = await query(
          `SELECT d.friendly_name, t.property, t.value, t.unit
           FROM telemetry t JOIN devices d ON d.ieee_addr = t.device_ieee
           WHERE d.room_id = ? AND t.ts > datetime('now', '-5 minutes')
           ORDER BY t.ts DESC LIMIT 5`,
          room.id
        );
        if (tel.length > 0) {
          const parts = tel.map((t: any) => `${t.friendly_name}: ${t.property}=${t.value}${t.unit || ''}`);
          return res.json({ ok: true, text, action: `${room.name}: ${parts.join('; ')}` });
        }
        return res.json({ ok: true, text, action: `${room.name}: нет данных` });
      }
      return res.json({ ok: false, text, action: 'Не понял что проверить' });
    }

    return res.json({ ok: false, text, action: `Не понял команду «${text}». Попробуй: включи свет, какая температура, открой ворота.` });
  } catch (e: any) {
    logErrorWithLog(null, 'voice_error', e.message, req.body?.text || '');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Phase 3: Voice/AI — pending actions и suggestions ──────

// GET /api/voice/pending-actions
app.get('/api/voice/pending-actions', async (_req, res) => {
  try {
    const actions = await query('SELECT * FROM voice_pending_actions ORDER BY created_at DESC LIMIT 50');
    res.json({ ok: true, actions });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'pending_actions');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/voice/pending-actions/:id/confirm
app.post('/api/voice/pending-actions/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT * FROM voice_pending_actions WHERE id = ?', id);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Not found' });

    const action = rows[0];
    // Execute the pending action based on kind
    if (action.kind === 'set_device' || action.kind === 'adjust_climate') {
      const payload = JSON.parse(action.payload_json || '{}');
      if (payload.deviceId && payload.state) {
        await logCommand(payload.deviceId, payload.state, JSON.stringify(payload), 'voice_confirm');
        await logStateChange(payload.deviceId, 'unknown', payload.state, 'voice_confirm');
      }
    }

    await query('DELETE FROM voice_pending_actions WHERE id = ?', id);
    res.json({ ok: true, confirmed: id });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'pending_confirm');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/voice/pending-actions/:id/dismiss
app.post('/api/voice/pending-actions/:id/dismiss', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT * FROM voice_pending_actions WHERE id = ?', id);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Not found' });

    await query('DELETE FROM voice_pending_actions WHERE id = ?', id);
    res.json({ ok: true, dismissed: id });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'pending_dismiss');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/voice/suggestions
app.get('/api/voice/suggestions', async (_req, res) => {
  try {
    const suggestions = await query('SELECT * FROM voice_suggestions WHERE accepted = false ORDER BY created_at DESC LIMIT 20');
    res.json({ ok: true, suggestions });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'suggestions');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/voice/suggestions/:id/accept → creates scenario
app.post('/api/voice/suggestions/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT * FROM voice_suggestions WHERE id = ?', id);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Not found' });

    const sug = rows[0];
    const payload = JSON.parse(sug.payload_json || '{}');

    // Create scenario from suggestion
    await query(
      'INSERT INTO scenarios (id, name, description, triggers_json, actions_json, active) VALUES (?, ?, ?, ?, ?, ?)',
      Date.now(),
      sug.text,
      payload.description || sug.text,
      JSON.stringify(payload.condition || {}),
      JSON.stringify(payload.action || {}),
      true
    );

    await query('UPDATE voice_suggestions SET accepted = true WHERE id = ?', id);
    res.json({ ok: true, scenario_created: sug.text });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'suggestion_accept');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// AIR QUALITY — нормали, пороги, рекомендации
// ═══════════════════════════════════════════════════════════

/** Пороги качества воздуха по каждому параметру */
const AIR_QUALITY_THRESHOLDS: Record<string, { good: number; warn: number; unit: string; label: string }> = {
  temperature: { good: 24, warn: 28, unit: '°C', label: 'Температура' },
  humidity:    { good: 60, warn: 70, unit: '%', label: 'Влажность' },
  co2:         { good: 1000, warn: 2000, unit: 'ppm', label: 'CO₂' },
  voc:         { good: 65, warn: 220, unit: 'ppb', label: 'VOC' },
  formaldehyde:{ good: 0.01, warn: 0.05, unit: 'мг/м³', label: 'Формальдегид' },
};

/** Рекомендации по каждому параметру в зависимости от уровня */
const AIR_QUALITY_TIPS: Record<string, { good: string[]; warn: string[]; danger: string[] }> = {
  temperature: {
    good: ['Температура комфортная'],
    warn: ['В комнате тепловато', 'Откройте окно на 10–15 минут'],
    danger: ['Слишком жарко', 'Включите кондиционер или вентиляцию'],
  },
  humidity: {
    good: ['Влажность в норме'],
    warn: ['Повышенная влажность', 'Проветрите помещение, включите вытяжку'],
    danger: ['Очень влажно', 'Риск плесени — включите осушитель воздуха'],
  },
  co2: {
    good: ['Свежий воздух'],
    warn: ['Душно, накапливается CO₂', 'Откройте окно — свежий воздух улучшит самочувствие'],
    danger: ['Опасно высокий CO₂', 'Срочно проветрите — это вредно для здоровья'],
  },
  voc: {
    good: ['Чистый воздух'],
    warn: ['Повышенный уровень VOC', 'Проветрите — возможно, источник бытовой химии'],
    danger: ['Опасный уровень VOC', 'Срочное проветривание. Проверьте утечку газа или источник химии'],
  },
  formaldehyde: {
    good: ['Формальдегид в норме'],
    warn: ['Повышенный формальдегид', 'Проветрите — возможны выделения от мебели или отделки'],
    danger: ['Высокий формальдегид', 'Опасно! Срочно проветрите. Проверьте новые материалы в комнате'],
  },
};

function getAirQualityStatus(prop: string, value: number): 'good' | 'warn' | 'danger' {
  const t = AIR_QUALITY_THRESHOLDS[prop];
  if (!t) return 'good';
  // Для температуры и влажности — warn если выше good, danger если выше warn
  if (prop === 'temperature') {
    if (value > t.warn) return 'danger';
    if (value > t.good) return 'warn';
    // Холодно тоже warn
    if (value < 18) return 'warn';
    if (value < 10) return 'danger';
    return 'good';
  }
  if (prop === 'humidity') {
    if (value > t.warn) return 'danger';
    if (value > t.good) return 'warn';
    if (value < 30) return 'warn';
    if (value < 20) return 'danger';
    return 'good';
  }
  // Для co2, voc, formaldehyde — чем больше, тем хуже
  if (value > t.warn) return 'danger';
  if (value > t.good) return 'warn';
  return 'good';
}

app.get('/api/air-quality', async (_req, res) => {
  try {
    // Один запрос — последние значения air-параметров для всех датчиков через ROW_NUMBER
    const telemetry = await query(`
      WITH ranked AS (
        SELECT t.device_ieee, t.property, t.value, t.unit,
               d.friendly_name, COALESCE(r.name, '—') as room_name,
               ROW_NUMBER() OVER (
                 PARTITION BY t.device_ieee, t.property
                 ORDER BY t.ts DESC
               ) as rn
        FROM telemetry t
        JOIN devices d ON d.ieee_addr = t.device_ieee
        LEFT JOIN rooms r ON d.room_id = r.id
        WHERE t.property IN ('temperature','humidity','co2','voc','formaldehyde')
          AND d.type = 'sensor'
      )
      SELECT * FROM ranked WHERE rn = 1
    `);

    // Группируем по устройству
    const grouped = new Map<string, any>();
    for (const t of telemetry) {
      if (!grouped.has(t.device_ieee)) {
        grouped.set(t.device_ieee, {
          device_ieee: t.device_ieee,
          device_name: t.friendly_name,
          room_name: t.room_name,
          props: {},
        });
      }
      grouped.get(t.device_ieee).props[t.property] = { value: t.value, unit: t.unit };
    }

    const results: any[] = [];
    const statusOrder: Record<string, number> = { good: 0, warn: 1, danger: 2 };

    for (const entry of grouped.values()) {
      const stats: any[] = [];
      const allTips: string[] = [];
      let worstStatus: 'good' | 'warn' | 'danger' = 'good';

      for (const [prop, info] of Object.entries(entry.props)) {
        const v = info as { value: number; unit: string };
        const threshold = AIR_QUALITY_THRESHOLDS[prop];
        if (!threshold) continue;
        const status = getAirQualityStatus(prop, v.value);
        if (statusOrder[status] > statusOrder[worstStatus]) worstStatus = status;
        const tips = AIR_QUALITY_TIPS[prop][status];
        allTips.push(...tips);
        stats.push({
          property: prop,
          label: threshold.label,
          value: v.value,
          unit: threshold.unit,
          status,
          thresholds: { good: threshold.good, warn: threshold.warn },
          tips,
        });
      }

      results.push({
        device_ieee: entry.device_ieee,
        device_name: entry.device_name,
        room_name: entry.room_name,
        overall: worstStatus,
        stats,
        recommendations: [...new Set(allTips)],
      });
    }

    res.json({ ok: true, air_quality: results });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'air_quality');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/dashboard/v2 ─────────────────────────────────
// Один запрос — все данные для нового дашборда: метрики + комнаты с устройствами/климатом/воздухом
app.get('/api/dashboard/v2', async (_req, res) => {
  try {
    // 1. Комнаты (только не-demo)
    const rooms = await query(`
      SELECT r.*, COUNT(d.ieee_addr) as device_count
      FROM rooms r LEFT JOIN devices d ON r.id = d.room_id AND ${demoFilter('d')}
      GROUP BY r.id, r.name, r.icon ORDER BY r.id
    `);

    // 2. Все air-параметры (последние значения) — только не-demo устройства
    const airData = await query(`
      WITH ranked AS (
        SELECT t.device_ieee, t.property, t.value, t.unit,
               d.friendly_name, d.room_id,
               ROW_NUMBER() OVER (
                 PARTITION BY t.device_ieee, t.property
                 ORDER BY t.ts DESC
               ) as rn
        FROM telemetry t
        JOIN devices d ON d.ieee_addr = t.device_ieee
        WHERE t.property IN ('temperature','humidity','co2','voc','formaldehyde')
          AND ${demoFilter('d')}
      )
      SELECT * FROM ranked WHERE rn = 1
    `);

    // Группируем air данные по комнатам
    const roomAir = new Map<number, any>();
    const globalMetrics: Record<string, { value: number; status: string; room_name: string }> = {};

    for (const t of airData) {
      const status = getAirQualityStatus(t.property, t.value);
      const threshold = AIR_QUALITY_THRESHOLDS[t.property];

      // Глобальная метрика
      if (!globalMetrics[t.property] || globalMetrics[t.property].value < t.value) {
        globalMetrics[t.property] = {
          value: t.value,
          status,
          room_name: findRoomName(rooms, t.room_id),
        };
      }

      // По комнатам
      const rid = t.room_id;
      if (!roomAir.has(rid)) {
        roomAir.set(rid, { overall: 'good', props: {}, params: [], recommendations: new Set<string>() });
      }
      const entry = roomAir.get(rid);
      entry.props[t.property] = { value: t.value, unit: t.unit, status };
      entry.params.push({
        property: t.property,
        label: threshold?.label || t.property,
        value: t.value,
        unit: threshold?.unit || t.unit,
        status,
        bar: calcBar(t.property, t.value),
      });
      const statusOrder: Record<string, number> = { good: 0, warn: 1, danger: 2 };
      if (statusOrder[status] > statusOrder[entry.overall]) entry.overall = status;
      const tips = AIR_QUALITY_TIPS[t.property]?.[status] || [];
      tips.forEach((tip: string) => entry.recommendations.add(tip));
    }

    // 3. Собираем ответ только по комнатам с устройствами
    const roomsWithDevices = rooms.filter((r: any) => r.device_count > 0);
    const enrichedRooms = await Promise.all(roomsWithDevices.map(async (room: any) => {
      const rid = room.id;
      const air = roomAir.get(rid);

      // Устройства в комнате с телеметрией (только не-demo)
      const devices = await query(`
        SELECT d.*,
          (SELECT COALESCE(json_group_array(
            json_object('property', t.property, 'value', t.value, 'unit', t.unit)
          ), '[]')
           FROM (SELECT property, value, unit FROM (
                 SELECT property, value, unit,
                   ROW_NUMBER() OVER (PARTITION BY property ORDER BY ts DESC) as rn
                 FROM telemetry WHERE device_ieee = d.ieee_addr
               ) sub WHERE rn = 1 ORDER BY property) t
          ) as latest_telemetry
        FROM devices d WHERE d.room_id = ? AND ${demoFilter('d')}
        ORDER BY d.type, d.ieee_addr
      `, rid);

      const parsedDevices = devices.map((row: any) => {
        const telemetry = typeof row.latest_telemetry === 'string'
          ? JSON.parse(row.latest_telemetry)
          : row.latest_telemetry || [];
        const computed_status = computeDeviceStatus(row.type, telemetry);
        // Извлекаем battery и linkquality из телеметрии
        const battery = telemetry.find((t: any) => t.property === 'battery')?.value ?? null;
        const linkquality = telemetry.find((t: any) => t.property === 'linkquality')?.value ?? null;
        // Last presence: сколько минут назад был человек
        const lastSeen = (row.type === 'presence_sensor' || row.type === 'motion_sensor') ? lastPresenceAt.get(row.ieee_addr) : null;
        const last_presence_minutes = lastSeen ? Math.floor((Date.now() - lastSeen) / 60000) : null;
        return {
          ...row,
          latest_telemetry: telemetry,
          computed_status,
          battery,
          linkquality,
          last_presence_minutes,
        };
      });

      // Климат (только не-demo устройства)
      const climate = await query(`
        SELECT cs.*, d.friendly_name
        FROM climate_setpoints cs JOIN devices d ON cs.device_ieee = d.ieee_addr
        WHERE d.room_id = ? AND ${demoFilter('d')}
        ORDER BY cs.device_ieee
      `, rid);

      // Контактные датчики (окна/двери) в комнате — только реальные окна/двери
      const contacts = await query(`
        SELECT d.ieee_addr, d.friendly_name, t.value as open,
          t.ts as last_seen
        FROM telemetry t
        JOIN devices d ON d.ieee_addr = t.device_ieee
        WHERE d.room_id = ? AND t.property = 'contact'
          AND d.type IN ('window_sensor', 'door_sensor')
          AND ${demoFilter('d')}
          AND t.ts = (SELECT MAX(ts) FROM telemetry t2
                      WHERE t2.device_ieee = t.device_ieee AND t2.property = 'contact')
        ORDER BY d.friendly_name
      `, rid);
      const openWindows = contacts
        .filter((c: any) => c.open > 0)
        .map((c: any) => ({ ieee_addr: c.ieee_addr, friendly_name: c.friendly_name }));
      const hasOpenWindows = openWindows.length > 0;

      const enrichedClimate = await Promise.all(climate.map(async (sp: any) => {
        const temp = await query(
          `SELECT value FROM telemetry WHERE device_ieee = ? AND property = 'temperature'
           ORDER BY ts DESC LIMIT 1`, sp.device_ieee
        );
        const humidity = await query(
          `SELECT value FROM telemetry WHERE device_ieee = ? AND property = 'humidity'
           ORDER BY ts DESC LIMIT 1`, sp.device_ieee
        );
        const currentTemp = temp[0]?.value || null;
        const needsHeat = currentTemp !== null && currentTemp < sp.target_temp - (sp.hysteresis || 1);
        const needsCool = currentTemp !== null && currentTemp > sp.target_temp + (sp.hysteresis || 1);
        return {
          ...sp,
          current_temp: currentTemp,
          current_humidity: humidity[0]?.value || null,
          needs_heat: needsHeat,
          needs_cool: needsCool,
          action: needsHeat ? 'heat' : needsCool ? 'cool' : 'idle',
        };
      }));

      // Температура для отображения на заголовке комнаты
      const roomTemp = air?.props?.temperature?.value ?? null;

      return {
        id: room.id,
        name: room.name,
        icon: room.icon,
        device_count: room.device_count || parsedDevices.length,
        temperature: roomTemp,
        climate: enrichedClimate,
        devices: parsedDevices,
        air_quality: air ? {
          overall: air.overall,
          badge: findBadgeParam(air.params),
          params: air.params,
          recommendations: [...air.recommendations],
        } : null,
        open_windows: openWindows,
        has_open_windows: hasOpenWindows,
      };
    }));

    // 4. Энергия (только не-demo устройства)
    const energyToday = await query(
      `SELECT SUM(value) as kwh FROM telemetry
       WHERE property = 'energy' AND ts >= datetime('now', 'start of day')
       AND device_ieee NOT IN (SELECT ieee_addr FROM devices WHERE is_demo = 1)`
    );

    res.json({
      ok: true,
      metrics: globalMetrics,
      energy_today: energyToday[0]?.kwh || 0,
      air_status: calcGlobalStatus(globalMetrics),
      rooms: enrichedRooms,
      security: {
        armed: true,
        openPoints: [],
      },
    });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'dashboard_v2');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Device Status Helpers ──────────────────────────────────

/** Маппинг типа девайса → какие свойства показывать как «статус» */
interface DeviceStatusRule {
  property: string;
  values: Record<number, { label: string; icon: string; color: string }>;
  threshold?: number;
}
const DEVICE_STATUS_MAP: Record<string, DeviceStatusRule[]> = {
  window_sensor: [
    { property: 'contact', values: { 0: { label: 'Закрыто', icon: 'check', color: 'green' }, 1: { label: 'Открыто', icon: 'x', color: 'red' } } },
  ],
  door_sensor: [
    { property: 'contact', values: { 0: { label: 'Закрыта', icon: 'check', color: 'green' }, 1: { label: 'Открыта', icon: 'x', color: 'red' } } },
  ],
  motion_sensor: [
    { property: 'presence', values: { 0: { label: 'Нет движения', icon: 'user', color: 'dim' }, 1: { label: 'Движение', icon: 'activity', color: 'yellow' } } },
  ],
  presence_sensor: [
    { property: 'presence', values: { 0: { label: 'Нет', icon: 'user', color: 'dim' }, 1: { label: 'Есть', icon: 'user', color: 'green' } } },
  ],
  leak_sensor: [
    { property: 'water_leak', values: { 0: { label: 'Сухо', icon: 'droplets', color: 'green' }, 1: { label: 'Протечка!', icon: 'droplets', color: 'red' } } },
  ],
  light: [
    { property: 'state', values: { 0: { label: 'Выключен', icon: 'power', color: 'dim' }, 1: { label: 'Включён', icon: 'power', color: 'yellow' } } },
  ],
  plug: [
    { property: 'state', values: { 0: { label: 'Выключена', icon: 'power', color: 'dim' }, 1: { label: 'Включена', icon: 'power', color: 'yellow' } } },
  ],
  switch: [
    { property: 'state', values: { 0: { label: 'Выкл', icon: 'power', color: 'dim' }, 1: { label: 'Вкл', icon: 'power', color: 'yellow' } } },
  ],
  air_monitor: [
    { property: 'co2', values: { 0: { label: 'CO₂ в норме', icon: 'wind', color: 'green' }, 1: { label: 'CO₂ повышен', icon: 'wind', color: 'yellow' }, 2: { label: 'CO₂ опасный!', icon: 'wind', color: 'red' } }, threshold: 600 },
    { property: 'voc', values: { 0: { label: 'VOC в норме', icon: 'wind', color: 'green' }, 1: { label: 'VOC повышен', icon: 'wind', color: 'yellow' }, 2: { label: 'VOC опасный!', icon: 'wind', color: 'red' } }, threshold: 150 },
    { property: 'pm25', values: { 0: { label: 'Воздух чистый', icon: 'wind', color: 'green' }, 1: { label: 'PM2.5 повышен', icon: 'wind', color: 'yellow' }, 2: { label: 'PM2.5 опасный', icon: 'wind', color: 'red' } }, threshold: 35 },
  ],
  gate_controller: [
    { property: 'contact', values: { 0: { label: 'Закрыты', icon: 'door', color: 'green' }, 1: { label: 'Открыты', icon: 'door', color: 'red' } } },
  ],
  climate: [
    { property: 'state', values: { 0: { label: 'Ожидание', icon: 'thermometer', color: 'dim' }, 1: { label: 'Работает', icon: 'flame', color: 'orange' } } },
  ],
  siren: [
    { property: 'state', values: { 0: { label: 'Тихо', icon: 'bell', color: 'dim' }, 1: { label: 'ТРЕВОГА!', icon: 'bell', color: 'red' } } },
  ],
};

/** Вычислить статус девайса по его типу и телеметрии */
function computeDeviceStatus(type: string, telemetry: { property: string; value: number }[]): { property: string; label: string; icon: string; color: string } | null {
  const rules = DEVICE_STATUS_MAP[type];
  if (!rules) return null;
  for (const rule of rules) {
    const tel = telemetry.find(t => t.property === rule.property);
    if (tel === undefined) continue;
    // Пороговая проверка (для air_monitor, co2, voc, pm25)
    if ('threshold' in rule) {
      const thr = (rule as any).threshold;
      if (tel.value === 0 || tel.value < 1) {
        // Значение 0 — датчик в норме
        const status = rule.values[0];
        if (status) return { property: rule.property, ...status };
      }
      if (tel.value >= thr * 2) {
        const status = rule.values[2];
        if (status) return { property: rule.property, ...status };
      }
      if (tel.value >= thr) {
        const status = rule.values[1];
        if (status) return { property: rule.property, ...status };
      }
      const status = rule.values[0];
      if (status) return { property: rule.property, ...status };
    }
    // Точное соответствие (для контактов, присутствия и т.д.)
    const status = rule.values[tel.value];
    if (status) return { property: rule.property, ...status };
  }
  return null;
}

/** Проверить, относится ли девайс к типу «окно/дверь» (для блока безопасности) */
function isOpenableDevice(type: string): boolean {
  return type === 'window_sensor' || type === 'door_sensor' || type === 'gate_controller';
}
function findRoomName(rooms: any[], room_id: number): string {
  const r = rooms.find((r: any) => r.id === room_id);
  return r?.name || '—';
}

/** Рассчитать ширину прогресс-бара (0-100%) относительно порогов */
function calcBar(prop: string, value: number): number {
  const t = AIR_QUALITY_THRESHOLDS[prop];
  if (!t) return 0;
  if (prop === 'temperature') {
    // good: 18-24, warn: 24-28, danger: >28
    if (value <= 18) return Math.max(0, ((18 - value) / 18) * 50);
    if (value <= t.good) return 25 + ((t.good - value) / (t.good - 18)) * 25;
    if (value <= t.warn) return 50 + ((value - t.good) / (t.warn - t.good)) * 25;
    return Math.min(100, 75 + ((value - t.warn) / 5) * 25);
  }
  if (prop === 'humidity') {
    // good: 30-60, warn: 60-70, danger: >70 (и <30)
    if (value < 30) return Math.max(0, ((30 - value) / 30) * 25);
    if (value <= t.good) return 25 + ((value) / t.good) * 25;
    if (value <= t.warn) return 50 + ((value - t.good) / (t.warn - t.good)) * 25;
    return Math.min(100, 75 + ((value - t.warn) / 20) * 25);
  }
  // co2, voc, formaldehyde — линейно до 2× порога danger
  const dangerVal = t.warn * 2;
  return Math.min(100, (value / dangerVal) * 100);
}

/** Найти "главный" проблемный параметр для бейджика */
function findBadgeParam(params: any[]): string | null {
  const bad = params.filter((p: any) => p.status === 'danger');
  if (bad.length > 0) return bad[0].label;
  const warn = params.filter((p: any) => p.status === 'warn');
  if (warn.length > 0) return warn[0].label;
  return null;
}

/** Общий статус воздуха по всем глобальным метрикам */
function calcGlobalStatus(metrics: Record<string, any>): 'good' | 'warn' | 'danger' {
  const order: Record<string, number> = { good: 0, warn: 1, danger: 2 };
  let worst: 'good' | 'warn' | 'danger' = 'good';
  for (const m of Object.values(metrics)) {
    const st: string = (m as any).status;
    if (order[st] > order[worst]) worst = st as 'good' | 'warn' | 'danger';
  }
  return worst;
}

// ── Export (server started by index.ts) ──────────────────

export default app;
