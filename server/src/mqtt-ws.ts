import mqtt from 'mqtt';
import { stmt, db, logErrorWithLog, logStateChange, query, DB_PATH } from './db';
import { validateMqttPayload, type MqttTelemetryPayload } from './schemas';

const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
let client: mqtt.MqttClient | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RECONNECT_DELAY = 60_000; // 1 minute max
const BASE_DELAY = 5_000;

// WebSocket server — регистрируется в attachWebSocket, используется в handleMessage
let wss: any = null;

// Track last presence time per device (in-memory)
const lastPresenceAt = new Map<string, number>();

// Track device type per IEEE (from handleDeviceDiscovery)
const deviceTypes = new Map<string, string>();

export function setWSServer(wsServer: any) {
  wss = wsServer;
}

export function connectMQTT() {
  // Don't stack connections — destroy previous if exists
  if (client) {
    try { client.end(true); } catch {}
    client = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  client = mqtt.connect(MQTT_URL, {
    reconnectPeriod: 0, // We handle reconnection ourselves
    connectTimeout: 10_000,
  });

  client.on('connect', () => {
    reconnectAttempts = 0;
    logger.log("[MQTT-WS] ", `📡 MQTT connected: ${MQTT_URL}`);
    client!.subscribe('zigbee2mqtt/#', (err) => {
      if (err) {
        logErrorWithLog(null, 'mqtt_subscribe_error', err.message, MQTT_URL);
      } else {
        logger.log("[MQTT-WS] ", '🔍 Listening: zigbee2mqtt/# → DuckDB');
      }
    });
  });

  client.on('error', (err) => {
    // Don't spam logs for connection refused (expected when MQTT is down)
    if (reconnectAttempts < 5) {
      logErrorWithLog(null, 'mqtt_error', err.message, MQTT_URL);
    }
  });

  client.on('close', () => {
    const delay = Math.min(BASE_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    reconnectAttempts++;
    
    if (reconnectAttempts <= 3) {
      logger.log("[MQTT-WS] ", `📡 MQTT disconnected — reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})...`);
    } else if (reconnectAttempts === 4) {
      logger.log("[MQTT-WS] ", '📡 MQTT still down — switching to silent retry mode (log every 10th attempt)');
    } else if (reconnectAttempts % 10 === 0) {
      logger.log("[MQTT-WS] ", `📡 MQTT reconnecting... (attempt ${reconnectAttempts}, next delay ${delay / 1000}s)`);
    }
    
    reconnectTimer = setTimeout(() => connectMQTT(), delay);
  });

  client.on('message', (topic: string, payload: Buffer) => {
    handleMessage(topic, payload);
  });
}

function handleMessage(topic: string, payload: Buffer) {
  const topicParts = topic.split('/');
  if (topicParts[0] !== 'zigbee2mqtt') return;

  try {
    // Bridge events (devices list) — may be an array, skip Zod validation
    if (topicParts[1] === 'bridge') {
      const event = topicParts.slice(2).join('/');
      let data: any;
      try { data = JSON.parse(payload.toString()); } catch { data = null; }
      if (event === 'devices' && Array.isArray(data)) {
        handleBridgeDevices(data);
        return;
      }
      // bridge/event — device_interview / device_announce from Z2M
      if (event === 'event' && data?.type && (data.type === 'device_interview' || data.type === 'device_announce')) {
        handleBridgeEvent(data);
        return;
      }
      logger.log("[MQTT-WS] ", `🌉 Bridge: ${event}`);
      return;
    }

    const data = validateMqttPayload(payload.toString());
    if (!data) {
      logErrorWithLog(null, 'mqtt_validation_error', 'Payload failed Zod validation', topic);
      return;
    }

    const friendlyName = topicParts[1];
    if (!friendlyName) return;

    // Device discovery
    if (data.type === 'device_announce' || data.type === 'device_interview') {
      handleDeviceDiscovery(friendlyName, data);
      return;
    }

    // Device leave
    if (data.type === 'device_leave') {
      logStateChange(data.ieee_address || friendlyName, 'online', 'removed', 'device_leave');
      return;
    }

    // Regular telemetry
    // 🔍 RAW log: показываем всё что пришло от Z2M
    if (friendlyName === 'Окно левое' || data.contact !== undefined || friendlyName === 'Датчик воздуха') {
      logger.log("[MQTT-WS] ", `🔍 RAW ${friendlyName}: ${JSON.stringify(data)}`);
    }
    handleTelemetry(friendlyName, data);
  } catch (e: any) {
    logErrorWithLog(null, 'mqtt_parse_error', e.message, topic);
  }
}

// ── Device Discovery ────────────────────────────────────
function handleDeviceDiscovery(friendlyName: string, data: any) {
  const ieee = data.ieee_address || data.ieeeAddr || friendlyName;
  const name = friendlyName.trim();
  try {
    stmt.upsertDevice.run(
      ieee, name,
      data.definition?.model || data.model_id || 'unknown',
      data.definition?.vendor || 'unknown',
      data.type || 'unknown',
      1 // default room
    );
    // Track device type
    if (data.type) deviceTypes.set(ieee, data.type);
    logger.log("[MQTT-WS] ", `🔍 Device discovered: ${friendlyName} (${data.definition?.model || 'pairing...'})`);

    // Log discovery event for SSE streaming
    try {
      stmt.insertDiscoveryEvent.run(
        ieee, name,
        data.definition?.model || data.model_id || null,
        data.definition?.vendor || null
      );
    } catch (e: any) {
      logErrorWithLog(ieee, 'discovery_event_error', e.message);
    }

    // Broadcast via WebSocket if connected
    if (wss) {
      const event = {
        type: 'device_discovered',
        ieee_address: ieee,
        friendly_name: name,
        model: data.definition?.model || data.model_id || null,
        vendor: data.definition?.vendor || null,
        timestamp: new Date().toISOString(),
      };
      const msg = JSON.stringify({ type: 'discovery', data: event });
      wss.clients.forEach((client: any) => {
        try { client.send(msg); } catch {}
      });
    }
  } catch (e: any) {
    logErrorWithLog(ieee, 'discovery_error', e.message, friendlyName);
  }
}

// ── Bridge Event (device_interview / device_announce from zigbee2mqtt/bridge/event) ──
function handleBridgeEvent(data: any) {
  const info = data.data;
  if (!info?.ieee_address) return;
  const ieee = info.ieee_address;
  const name = info.friendly_name?.trim() || ieee;
  // Use definition from the interview data if available
  const model = info.definition?.model || info.model_id || null;
  const vendor = info.definition?.vendor || null;
  try {
    stmt.upsertDevice.run(ieee, name, model, vendor, 'sensor', 1);
    logger.log("[MQTT-WS] ", `🔍 Bridge event — ${data.type}: ${name} (${model || 'pairing...'})`);

    // Log discovery event for SSE streaming
    try {
      stmt.insertDiscoveryEvent.run(ieee, name, model, vendor);
    } catch { }

    // Broadcast via WebSocket
    if (wss) {
      const event = {
        type: 'device_discovered',
        ieee_address: ieee,
        friendly_name: name,
        model: model,
        vendor: vendor,
        timestamp: new Date().toISOString(),
      };
      const msg = JSON.stringify({ type: 'discovery', data: event });
      wss.clients.forEach((client: any) => {
        try { client.send(msg); } catch { }
      });
    }
  } catch (e: any) {
    logErrorWithLog(ieee, 'bridge_event_error', e.message, data.type);
  }
}

// ── Bridge Devices (process full device list on reconnect) ──
function handleBridgeDevices(devices: any) {
  if (!Array.isArray(devices)) return;
  for (const dev of devices) {
    if (dev.type === 'Coordinator' || dev.type === 'Router' || dev.disabled) continue;
    const ieee = dev.ieee_address || dev.ieeeAddr;
    const name = dev.friendly_name?.trim() || ieee;
    const model = dev.definition?.model || dev.model_id || 'unknown';
    const vendor = dev.definition?.vendor || 'unknown';
    try {
      stmt.upsertDevice.run(ieee, name, model, vendor, dev.type || 'unknown', 1);
      if (dev.type) deviceTypes.set(ieee, dev.type);
      logger.log("[MQTT-WS] ", `📦 Bridge device: ${name} (${model})`);
    } catch (e: any) {
      logErrorWithLog(ieee, 'bridge_device_error', e.message, name);
    }
  }
}

// ── Telemetry Handler ───────────────────────────────────
function handleTelemetry(friendlyName: string, data: any) {
  let ieee = data.ieee_address || data.ieeeAddr || null;
  const raw = JSON.stringify(data);

  // If telemetry has no ieee_address, look it up from DB by friendly_name
  if (!ieee) {
    try {
      const row = db.prepare('SELECT ieee_addr FROM devices WHERE friendly_name = ? LIMIT 1').get(friendlyName) as { ieee_addr: string } | undefined;
      if (row?.ieee_addr && /^0x[0-9a-f]{16}$/i.test(row.ieee_addr)) {
        ieee = row.ieee_addr;
      } else {
        logger.log("[MQTT-WS] ", `⏭️ Skipping telemetry from ${friendlyName}: no ieee_address and device not registered`);
        return;
      }
    } catch {
      logger.log("[MQTT-WS] ", `⏭️ Skipping telemetry from ${friendlyName}: DB lookup failed`);
      return;
    }
  }

  // Safety: ensure ieee is a real 64-bit MAC address (0x + 16 hex chars)
  if (!/^0x[0-9a-f]{16}$/i.test(ieee)) {
    logger.log("[MQTT-WS] ", `⏭️ Skipping telemetry from ${friendlyName}: invalid IEEE (${ieee})`);
    return;
  }

  // Known property mappings
  const propertyMap: Record<string, { value: any; unit: string }> = {
    temperature: { value: data.temperature, unit: '°C' },
    humidity: { value: data.humidity, unit: '%' },
    pm25: { value: data.pm25, unit: 'µg/m³' },
    illuminance: { value: data.illuminance ?? data.illuminance_lux, unit: 'lux' },
    soil_moisture: { value: data.soil_moisture, unit: '%' },
    pressure: { value: data.pressure, unit: 'hPa' },
    battery: { value: data.battery, unit: '%' },
    voltage: { value: data.voltage, unit: 'V' },
    current: { value: data.current, unit: 'A' },
    power: { value: data.power, unit: 'W' },
    energy: { value: data.energy, unit: 'kWh' },
    state: { value: data.state, unit: 'state' },
    presence: { value: data.presence ? 'present' : 'absent', unit: 'bool' },
    contact: { value: data.contact ? 'open' : 'closed', unit: 'bool' },
    water_leak: { value: data.water_leak ? 'leak' : 'dry', unit: 'bool' },
    linkquality: { value: data.linkquality, unit: 'lqi' },
  };

  let stored = 0;

  for (const [prop, { value, unit }] of Object.entries(propertyMap)) {
    if (value !== undefined && value !== null) {
      try {
        const numericValue = typeof value === 'boolean'
          ? (value ? 1 : 0)
          : typeof value === 'string'
            ? (['ON', 'open', 'present', 'leak'].includes(value) ? 1 : 0)
            : value;

        stmt.insertTelemetry.run(ieee, prop, numericValue, unit, raw);
        stored++;
      } catch (e: any) {
        logErrorWithLog(ieee, 'telemetry_insert_error', e.message, `${prop}=${value}`);
      }
    }
  }

  // Track state changes
  if (data.state !== undefined) {
    query(
      `SELECT value FROM telemetry WHERE device_ieee = ? AND property = 'state' ORDER BY ts DESC LIMIT 1`,
      ieee
    ).then((rows: any[]) => {
      const prev = rows[0]?.value;
      const curr = data.state === 'ON' ? 1 : 0;
      if (prev !== undefined && prev !== curr) {
        logStateChange(ieee, prev === 1 ? 'ON' : 'OFF', curr === 1 ? 'ON' : 'OFF', 'mqtt');
      }
    }).catch(() => {});
  }

  // Track last presence time for presence_sensor & motion_sensor
  if (data.presence === true || data.presence === 1) {
    lastPresenceAt.set(ieee, Date.now());
  }

  // Update device last_seen — only if ieee looks like a real MAC address
  if (/^0x[0-9a-f]{16}$/i.test(ieee)) {
    try {
      stmt.upsertDevice.run(ieee, friendlyName, null, null, null, 1);
    } catch {}
  }

  if (stored > 0) {
    const sample = Object.entries(propertyMap)
      .filter(([, v]) => v.value !== undefined && v.value !== null)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${v.value}${v.unit}`)
      .join(' ');
    logger.log("[MQTT-WS] ", `📊 ${friendlyName}: ${sample}`);

    // Forward to all WebSocket clients in real-time
    if (wss) {
      const wsPayload = JSON.stringify({
        type: 'mqtt',
        topic: `zigbee2mqtt/${friendlyName}`,
        payload: data,
        ts: new Date().toISOString(),
      });
      for (const c of wss.clients) {
        if (c.readyState === 1) {
          try { c.send(wsPayload); } catch {}
        }
      }
    }

    // Evaluate scenarios against incoming telemetry
    import('./engine').then(({ evaluateTelemetry }) => {
      const props: Record<string, number> = {};
      for (const [prop, meta] of Object.entries(propertyMap)) {
        const val = meta.value;
        if (val !== undefined && val !== null) {
          props[prop] = typeof val === 'boolean' ? (val ? 1 : 0)
            : typeof val === 'string' ? (['ON','open','present','leak'].includes(val) ? 1 : 0)
            : val;
        }
      }
      evaluateTelemetry(ieee, props).catch(e =>
        logErrorWithLog(ieee, 'scenario_eval_error', e.message, friendlyName)
      );
    }).catch(() => {});
  }
}

// ── WebSocket Server ────────────────────────────────────
import type { Server as WSServer, WebSocket as WSClient } from 'ws';
import { Server as HTTPServer } from 'http';
import logger from './logger';

const WebSocketServer = require('ws').Server;

let wsAttached = false;

export function attachWebSocket(server: HTTPServer) {
  if (wsAttached) return; // Prevent double attachment
  wsAttached = true;
  
  // ═══ noServer mode — we handle upgrade manually for auth ═══
  const wss: WSServer = new WebSocketServer({ noServer: true });

  // Manual upgrade handler with AUTH required
  server.on('upgrade', (req, socket, head) => {
    // Only handle /ws path
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    // ── AUTH: optional — try header, then query param, then allow if no keys configured ──
    const keys = (process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      const apiKey = req.headers['x-api-key'] as string
        || new URL(req.url || '/', `http://${req.headers.host}`).searchParams.get('api_key') as string;
      if (!apiKey || !keys.includes(apiKey)) {
        logger.log("[MQTT-WS] ", `🔌 WebSocket rejected: no valid auth (IP: ${req.socket.remoteAddress})`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws: WSClient) => {
      wss.emit('connection', ws, req);
    });
  });

  // Load last presence from DB for motion/presence sensors (in case MQTT missed it)
  try {
    const { query } = require('./db');
    query(`
      SELECT t.device_ieee, MAX(t.ts) as last_ts
      FROM telemetry t
      JOIN devices d ON d.ieee_addr = t.device_ieee
      WHERE t.property = 'presence' AND t.value = 1
        AND (d.type = 'motion_sensor' OR d.type = 'presence_sensor')
      GROUP BY t.device_ieee
    `).then((lastPresenceRows: any[]) => {
      for (const row of lastPresenceRows) {
        const ts = new Date(row.last_ts).getTime();
        if (!isNaN(ts)) lastPresenceAt.set(row.device_ieee, ts);
      }
      if (lastPresenceRows.length > 0) {
        logger.log("[MQTT-WS] ", `👤 Loaded ${lastPresenceRows.length} last-presence timestamps from DB`);
      }
    }).catch((e: any) => {
      logErrorWithLog(null, 'load_presence_init', e.message, 'startup');
    });
  } catch (e: any) {
    logErrorWithLog(null, 'load_presence_init', e.message, 'startup');
  }

  wss.on('connection', (ws: WSClient) => {
    logger.log("[MQTT-WS] ", '🔌 WebSocket client connected');

    ws.on('close', () => logger.log("[MQTT-WS] ", '🔌 WebSocket client disconnected'));

    // Send latest telemetry on connect
    query(`SELECT * FROM telemetry ORDER BY ts DESC LIMIT 20`).then((rows: any[]) => {
      ws.send(JSON.stringify({ type: 'telemetry_init', data: rows }));
    }).catch(() => {});
  });

  // Hook into MQTT to forward to all WebSocket clients
  // (Форвардинг теперь в handleTelemetry — надёжнее, работает всегда)
  setWSServer(wss);

  logger.log("[MQTT-WS] ", '🔌 WebSocket: ws://localhost:8788/ws');
  return wss;
}

export function publishCommand(deviceIeee: string, command: string, payload?: any) {
  if (!client || !client.connected) {
    logErrorWithLog(deviceIeee, 'mqtt_publish_error', 'MQTT not connected', command);
    return false;
  }

  const topic = `zigbee2mqtt/${deviceIeee}/set`;
  const msg = JSON.stringify({ state: command });
  client.publish(topic, msg);
  logger.log("[MQTT-WS] ", `📤 MQTT: ${topic} → ${msg}`);
  return true;
}

export { client, lastPresenceAt };

/** Gracefully disconnect MQTT (used when switching to demo mode) */
export function disconnectMQTT(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (client) {
    try { client.end(true); } catch {}
    client = null;
  }
  reconnectAttempts = 0;
  logger.log("[MQTT-WS] ", '📡 MQTT disconnected');
}
