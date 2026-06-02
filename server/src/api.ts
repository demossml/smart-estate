import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { stmt, query, logError, logCommand, logStateChange, DB_PATH } from './db';
import { authMiddleware, optionalAuth } from './middleware/auth';

// Fix BigInt serialization for DuckDB
(BigInt.prototype as any).toJSON = function () { return Number(this); };

const app = express();

// ── Security Headers ─────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for Mini App
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ─────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow localhost on any port, t.me, and configured origins
    if (!origin) return callback(null, true);
    if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) return callback(null, true);
    if (origin === 'https://t.me' || origin === 'https://web.telegram.org') return callback(null, true);
    const extra = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
    if (extra.includes(origin)) return callback(null, true);
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Signature', 'X-Timestamp', 'X-Nonce', 'X-Telegram-InitData'],
  maxAge: 86400,
}));

// ── Rate Limiting ────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60_000,       // 1 minute
  max: 120,               // 120 requests per minute
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

// Auth: enforce if API_KEYS is configured, otherwise allow all
let authLogged = false;
app.use((req, res, next) => {
  const enforceAuth = !!(process.env.API_KEYS || '');
  if (!enforceAuth) return optionalAuth(req, res, next);
  if (!authLogged) {
    console.log('🔒 Auth middleware active');
    authLogged = true;
  }
  return authMiddleware(req, res, next);
});

// ── GET /api/status ─────────────────────────────────────
app.get('/api/status', async (_req, res) => {
  try {
    const devices = await query('SELECT COUNT(*) as cnt FROM devices');
    const online = await query("SELECT COUNT(*) as cnt FROM devices WHERE status = 'online'");
    const errors24h = await query(
      "SELECT COUNT(*) as cnt FROM errors WHERE ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'"
    );
    res.json({
      ok: true,
      db: DB_PATH,
      devices: { total: devices[0]?.cnt || 0, online: online[0]?.cnt || 0 },
      errors24h: errors24h[0]?.cnt || 0,
    });
  } catch (e: any) {
    logError(null, 'api_error', e.message, 'status');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/devices ────────────────────────────────────
app.get('/api/devices', async (req, res) => {
  try {
    const filter = req.query.filter as string; // 'online' | 'offline' | undefined
    let sql = `
      SELECT d.*, r.name as room_name, r.icon as room_icon
      FROM devices d LEFT JOIN rooms r ON d.room_id = r.id
    `;
    if (filter === 'online') sql += " WHERE d.status = 'online'";
    if (filter === 'offline') sql += " WHERE d.status = 'offline'";
    sql += ' ORDER BY d.status DESC, d.last_seen DESC';

    const rows = await query(sql);

    // Enrich with latest telemetry
    const enriched = await Promise.all(rows.map(async (d: any) => {
      const latest = await query(
        `SELECT property, value, unit FROM telemetry 
         WHERE device_ieee = ? ORDER BY ts DESC LIMIT 3`,
        d.ieee_addr
      );
      return { ...d, latest_telemetry: latest };
    }));

    res.json({ ok: true, devices: enriched });
  } catch (e: any) {
    logError(null, 'api_error', e.message, 'devices');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/devices/:id ────────────────────────────────
app.get('/api/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const devices = await query(`SELECT * FROM devices WHERE ieee_addr = ?`, id);
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
      `SELECT property, MIN(value) as min, MAX(value) as max, AVG(value)::DECIMAL(8,2) as avg, COUNT(*) as cnt
       FROM telemetry WHERE device_ieee = ? AND ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
       GROUP BY property`,
      id
    );

    res.json({ ok: true, device, telemetry, commands, state_changes: stateChanges, stats });
  } catch (e: any) {
    logError(null, 'api_error', e.message, `device/${req.params.id}`);
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
    logError(id, 'command_error', e.message, 'ON');
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
    logError(id, 'command_error', e.message, 'OFF');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/telemetry ──────────────────────────────────
app.get('/api/telemetry', async (req, res) => {
  try {
    const device = req.query.device as string;
    const property = req.query.property as string;
    const period = req.query.period as string || '24h';
    const limit = parseInt(req.query.limit as string) || 100;

    let tsFilter: string;
    switch (period) {
      case '1h': tsFilter = "INTERVAL '1 hour'"; break;
      case '6h': tsFilter = "INTERVAL '6 hours'"; break;
      case '7d': tsFilter = "INTERVAL '7 days'"; break;
      case '30d': tsFilter = "INTERVAL '30 days'"; break;
      default: tsFilter = "INTERVAL '24 hours'";
    }

    let sql = `SELECT * FROM telemetry WHERE ts >= CURRENT_TIMESTAMP - ${tsFilter}`;
    const params: any[] = [];

    if (device) { sql += ' AND device_ieee = ?'; params.push(device); }
    if (property) { sql += ' AND property = ?'; params.push(property); }
    sql += ' ORDER BY ts DESC LIMIT ?';
    params.push(limit);

    const rows = await query(sql, ...params);
    res.json({ ok: true, telemetry: rows, count: rows.length });
  } catch (e: any) {
    logError(null, 'api_error', e.message, 'telemetry');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/rooms ──────────────────────────────────────
app.get('/api/rooms', async (_req, res) => {
  try {
    const rooms = await query(`
      SELECT r.*, COUNT(d.ieee_addr) as device_count
      FROM rooms r LEFT JOIN devices d ON r.id = d.room_id
      GROUP BY r.id, r.name, r.icon ORDER BY r.id
    `);

    // Enrich with aggregated telemetry per room
    const enriched = await Promise.all(rooms.map(async (room: any) => {
      const temp = await query(`
        SELECT AVG(value)::DECIMAL(4,1) as avg_temp FROM telemetry
        WHERE property = 'temperature' AND device_ieee IN (
          SELECT ieee_addr FROM devices WHERE room_id = ?
        ) AND ts >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
      `, room.id);
      return { ...room, avg_temperature: temp[0]?.avg_temp || null };
    }));

    res.json({ ok: true, rooms: enriched });
  } catch (e: any) {
    logError(null, 'api_error', e.message, 'rooms');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/energy ─────────────────────────────────────
app.get('/api/energy', async (_req, res) => {
  try {
    const today = await query(
      `SELECT SUM(value)::DECIMAL(6,2) as kwh FROM telemetry
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
    logError(null, 'api_error', e.message, 'energy');
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
    res.json({ ok: true, setpoints: enriched });
  } catch (e: any) {
    logError(null, 'api_error', e.message, 'climate');
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/climate/:device_ieee', async (req, res) => {
  try {
    const sp = await query('SELECT * FROM climate_setpoints WHERE device_ieee = ?', req.params.device_ieee);
    if (!sp.length) return res.status(404).json({ ok: false, error: 'Setpoint not found' });
    res.json({ ok: true, setpoint: sp[0] });
  } catch (e: any) {
    logError(null, 'api_error', e.message, 'climate_get');
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
    logError(null, 'api_error', e.message, 'climate_update');
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
    await query("INSERT INTO gate_access_log (id,device_ieee,action,source,details) VALUES (nextval('gate_access_seq'),?,?,?,?)",
      req.params.id, 'open', 'api', req.body.reason || null);
    await query("UPDATE commands SET status='success',completed_at=CURRENT_TIMESTAMP WHERE id=?", cmdId);
    logStateChange(req.params.id, 'closed', 'open', 'gate_api');
    res.json({ ok: true, device: req.params.id, state: 'open', command_id: cmdId });
  } catch (e: any) {
    logError(req.params.id, 'gate_error', e.message, 'open');
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/gates/:id/close', commandLimiter, async (req, res) => {
  try {
    const cmdId = logCommand(req.params.id, 'CLOSE', '{}', 'gate_api');
    await query("INSERT INTO gate_access_log (id,device_ieee,action,source,details) VALUES (nextval('gate_access_seq'),?,?,?,?)",
      req.params.id, 'close', 'api', req.body.reason || null);
    await query("UPDATE commands SET status='success',completed_at=CURRENT_TIMESTAMP WHERE id=?", cmdId);
    logStateChange(req.params.id, 'open', 'closed', 'gate_api');
    res.json({ ok: true, device: req.params.id, state: 'closed', command_id: cmdId });
  } catch (e: any) {
    logError(req.params.id, 'gate_error', e.message, 'close');
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
    logError(null, 'api_error', e.message, 'access_log');
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
    logError(null, 'api_error', e.message, 'events');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/scenarios ──────────────────────────────────
app.get('/api/scenarios', async (_req, res) => {
  try {
    const rows = await query(`SELECT * FROM scenarios ORDER BY id`);
    res.json({ ok: true, scenarios: rows });
  } catch (e: any) {
    logError(null, 'api_error', e.message, 'scenarios');
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
    logError(null, 'api_error', e.message, 'scenario_toggle');
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
      active !== undefined ? active : true
    );

    // Reload both engine and scheduler
    import('./engine').then(m => m.reloadScenarios()).catch(() => {});
    import('./scheduler').then(m => m.reloadScheduledScenarios()).catch(() => {});

    const s = await query('SELECT * FROM scenarios WHERE id = ?', id);
    res.status(201).json({ ok: true, scenario: s[0] });
  } catch (e: any) {
    logError(null, 'api_error', e.message, 'scenario_create');
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
    logError(null, 'api_error', e.message, 'scenario_update');
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
    logError(null, 'api_error', e.message, 'scenario_delete');
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
    logError(null, 'api_error', e.message, 'scenario_executions');
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
    logError(null, 'api_error', e.message, 'groups');
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
    logError(null, 'api_error', e.message, 'group_detail');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/groups/:id/add-device
app.post('/api/groups/:id/add-device', async (req, res) => {
  try {
    const { device_ieee } = req.body;
    if (!device_ieee) return res.status(400).json({ ok: false, error: 'device_ieee required' });

    await query(
      'INSERT OR IGNORE INTO device_group_members (group_id, device_ieee) VALUES (?, ?)',
      req.params.id, device_ieee
    );
    res.json({ ok: true, group_id: req.params.id, device_ieee });
  } catch (e: any) {
    logError(null, 'api_error', e.message, 'add_device_to_group');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/groups/:id/remove-device
app.post('/api/groups/:id/remove-device', async (req, res) => {
  try {
    const { device_ieee } = req.body;
    await query(
      'DELETE FROM device_group_members WHERE group_id = ? AND device_ieee = ?',
      req.params.id, device_ieee
    );
    res.json({ ok: true, group_id: req.params.id, device_ieee });
  } catch (e: any) {
    logError(null, 'api_error', e.message, 'remove_device_from_group');
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
    logError(null, 'api_error', e.message, 'group_all_on');
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
    logError(null, 'api_error', e.message, 'group_all_off');
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
    logError(null, 'api_error', e.message, 'audit');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Start ────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '8788');
app.listen(PORT, () => {
  console.log(`🚀 Smart Estate API: http://localhost:${PORT}`);
  console.log(`   Endpoints: /api/status /api/devices /api/telemetry /api/rooms /api/energy /api/events /api/audit`);
});

export default app;
