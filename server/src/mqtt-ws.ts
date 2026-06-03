import mqtt from 'mqtt';
import { stmt, logError, logStateChange, query, DB_PATH } from './db';
import { validateApiKey } from './crypto';
import { validateMqttPayload, type MqttTelemetryPayload } from './schemas';

const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
let client: mqtt.MqttClient | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RECONNECT_DELAY = 60_000; // 1 minute max
const BASE_DELAY = 5_000;

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
    console.log(`📡 MQTT connected: ${MQTT_URL}`);
    client!.subscribe('zigbee2mqtt/#', (err) => {
      if (err) {
        logError(null, 'mqtt_subscribe_error', err.message, MQTT_URL);
      } else {
        console.log('🔍 Listening: zigbee2mqtt/# → DuckDB');
      }
    });
  });

  client.on('error', (err) => {
    // Don't spam logs for connection refused (expected when MQTT is down)
    if (reconnectAttempts < 5) {
      logError(null, 'mqtt_error', err.message, MQTT_URL);
    }
  });

  client.on('close', () => {
    const delay = Math.min(BASE_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    reconnectAttempts++;
    
    if (reconnectAttempts <= 3) {
      console.log(`📡 MQTT disconnected — reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})...`);
    } else if (reconnectAttempts === 4) {
      console.log('📡 MQTT still down — switching to silent retry mode (log every 10th attempt)');
    } else if (reconnectAttempts % 10 === 0) {
      console.log(`📡 MQTT reconnecting... (attempt ${reconnectAttempts}, next delay ${delay / 1000}s)`);
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
    const data = validateMqttPayload(payload.toString());
    if (!data) {
      logError(null, 'mqtt_validation_error', 'Payload failed Zod validation', topic);
      return;
    }

    // Bridge events
    if (topicParts[1] === 'bridge') {
      const event = topicParts.slice(2).join('/');
      if (event === 'devices') return; // Skip full device list dump
      console.log(`🌉 Bridge: ${event}`);
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
    handleTelemetry(friendlyName, data);
  } catch (e: any) {
    logError(null, 'mqtt_parse_error', e.message, topic);
  }
}

// ── Device Discovery ────────────────────────────────────
function handleDeviceDiscovery(friendlyName: string, data: any) {
  const ieee = data.ieee_address || data.ieeeAddr || friendlyName;
  try {
    stmt.upsertDevice.run(
      ieee, friendlyName,
      data.definition?.model || data.model_id || 'unknown',
      data.definition?.vendor || 'unknown',
      data.type || 'unknown',
      1 // default room
    );
    console.log(`🔍 Device discovered: ${friendlyName} (${data.definition?.model || 'pairing...'})`);
  } catch (e: any) {
    logError(ieee, 'discovery_error', e.message, friendlyName);
  }
}

// ── Telemetry Handler ───────────────────────────────────
function handleTelemetry(friendlyName: string, data: any) {
  const ieee = data.ieee_address || data.ieeeAddr || friendlyName;
  const raw = JSON.stringify(data);

  // Known property mappings
  const propertyMap: Record<string, { value: any; unit: string }> = {
    temperature: { value: data.temperature, unit: '°C' },
    humidity: { value: data.humidity, unit: '%' },
    co2: { value: data.co2, unit: 'ppm' },
    voc: { value: data.voc, unit: 'ppb' },
    formaldehyde: { value: data.formaldehyde, unit: 'mg/m³' },
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
        logError(ieee, 'telemetry_insert_error', e.message, `${prop}=${value}`);
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

  // Update device last_seen
  try {
    stmt.upsertDevice.run(ieee, friendlyName, null, null, null, null);
  } catch {}

  if (stored > 0) {
    const sample = Object.entries(propertyMap)
      .filter(([, v]) => v.value !== undefined && v.value !== null)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${v.value}${v.unit}`)
      .join(' ');
    console.log(`📊 ${friendlyName}: ${sample}`);

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
        logError(ieee, 'scenario_eval_error', e.message, friendlyName)
      );
    }).catch(() => {});
  }
}

// ── WebSocket Server ────────────────────────────────────
import type { Server as WSServer, WebSocket as WSClient } from 'ws';
import { Server as HTTPServer } from 'http';

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

    // ── AUTH: API Key REQUIRED ──
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey || !validateApiKey(apiKey)) {
      console.log(`🔌 WebSocket rejected: no valid auth (IP: ${req.socket.remoteAddress})`);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws: WSClient) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WSClient) => {
    console.log('🔌 WebSocket client connected');

    ws.on('close', () => console.log('🔌 WebSocket client disconnected'));

    // Send latest telemetry on connect
    query(`SELECT * FROM telemetry ORDER BY ts DESC LIMIT 20`).then((rows: any[]) => {
      ws.send(JSON.stringify({ type: 'telemetry_init', data: rows }));
    }).catch(() => {});
  });

  // Hook into MQTT to forward to all WebSocket clients
  if (client) {
    client.on('message', (topic: string, payload: Buffer) => {
      wss.clients.forEach((c) => {
        if (c.readyState === 1) {
          try {
            c.send(JSON.stringify({
              type: 'mqtt',
              topic,
              payload: JSON.parse(payload.toString()),
              ts: new Date().toISOString(),
            }));
          } catch {}
        }
      });
    });
  }

  console.log('🔌 WebSocket: ws://localhost:8788/ws');
  return wss;
}

export function publishCommand(deviceIeee: string, command: string, payload?: any) {
  if (!client || !client.connected) {
    logError(deviceIeee, 'mqtt_publish_error', 'MQTT not connected', command);
    return false;
  }

  const topic = `zigbee2mqtt/${deviceIeee}/set`;
  const msg = JSON.stringify({ state: command });
  client.publish(topic, msg);
  console.log(`📤 MQTT: ${topic} → ${msg}`);
  return true;
}

export { client };
