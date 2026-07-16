import mqtt from 'mqtt';
import { stmt, db, logErrorWithLog, logStateChange, query, DB_PATH } from './db';
import { validateMqttPayload, type MqttTelemetryPayload } from './schemas';
import type { Server as WSServer, WebSocket as WSClient } from 'ws';
import { Server as HTTPServer } from 'http';
import logger from './logger';

const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const DEBUG_MQTT = process.env.DEBUG_MQTT === '1'; // включает подробный RAW-лог входящей телеметрии

let client: mqtt.MqttClient | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RECONNECT_DELAY = 60_000; // 1 minute max
const BASE_DELAY = 5_000;

// WebSocket server — регистрируется в attachWebSocket, используется в handleMessage
let wss: any = null;

// Track last presence time per device (in-memory)
const lastPresenceAt = new Map<string, number>();

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
    mqttConnected = true;
    logger.log("[MQTT-WS] ", `📡 MQTT connected: ${MQTT_URL}`);
    client!.subscribe('zigbee2mqtt/#', (err) => {
      if (err) {
        logErrorWithLog(null, 'mqtt_subscribe_error', err.message, MQTT_URL);
      } else {
        logger.log("[MQTT-WS] ", '🔍 Listening: zigbee2mqtt/# → SQLite');
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
    mqttConnected = false;
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
      // bridge/event — device_joined / device_interview / device_announce от Z2M.
      // Это ЕДИНСТВЕННОЕ место, где Z2M реально публикует эти события
      // (см. https://www.zigbee2mqtt.io/guide/usage/mqtt_topics_and_messages.html) —
      // на обычных per-device топиках их не бывает.
      if (event === 'event' && data?.type &&
          (data.type === 'device_interview' || data.type === 'device_announce' || data.type === 'device_joined')) {
        handleBridgeEvent(data);
        return;
      }
      // Отслеживаем permit_join для /api/zigbee/status
      if (event === 'response/permit_join' && data) {
        // Z2M публикует: {"data":{"time":120},"status":"ok"} — нет поля "value"
        logger.log("[MQTT-WS] ", `📡 permit_join response: ${JSON.stringify(data)}`);
        permitJoinActive = data.status === 'ok' && !!data.data;
        permitJoinTimeLeft = data.data?.time || 0;
        return;
      }
      // Синхронизируем реальное состояние permit_join из health info Z2M
      // Чтобы не расходиться когда таймаут закрыл сеть, а мы не получили ответа
      if (event === 'info' && data) {
        const z2mPermitJoin = data.permit_join === true;
        if (permitJoinActive !== z2mPermitJoin) {
          logger.log("[MQTT-WS] ", `🔄 permit_join sync: SmartE=${permitJoinActive} → Z2M=${z2mPermitJoin}`);
          permitJoinActive = z2mPermitJoin;
          if (!z2mPermitJoin) permitJoinTimeLeft = 0;
        }
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

    // Защитная ветка: по документации Z2M device_announce/device_interview приходят
    // только на zigbee2mqtt/bridge/event, никогда на zigbee2mqtt/<friendly_name>.
    // Эта проверка не должна срабатывать в норме — оставлена как safety net на случай
    // нестандартной прошивки/старой версии Z2M, а не как основной путь обнаружения.
    if (data.type === 'device_announce' || data.type === 'device_interview') {
      handleDeviceDiscovery(friendlyName, data);
      return;
    }

    // Device leave
    if (data.type === 'device_leave') {
      logStateChange(data.ieee_address || friendlyName, 'online', 'removed', 'device_leave');
      return;
    }

    if (DEBUG_MQTT) {
      logger.log("[MQTT-WS] ", `🔍 RAW ${friendlyName}: ${JSON.stringify(data)}`);
    }
    handleTelemetry(friendlyName, data);
  } catch (e: any) {
    logErrorWithLog(null, 'mqtt_parse_error', e.message, topic);
  }
}

// ── Device Discovery (safety-net path, см. комментарий в handleMessage) ─────
// НЕ вставляем в devices — только в discovery_events. Устройство появляется
// в БД только после подтверждения пользователем через POST /api/discovery/:ieee/confirm.
function handleDeviceDiscovery(friendlyName: string, data: any) {
  const ieee = data.ieee_address || data.ieeeAddr || friendlyName;
  const shortIeee = ieee.replace('0x', '').slice(-8).toUpperCase();
  const name = friendlyName?.trim() && !friendlyName.startsWith('0x')
    ? friendlyName.trim()
    : `Датчик ${shortIeee}`;
  try {
    const exposes = data.exposes || null;
    const model = data.definition?.model || data.model_id || null;
    const vendor = data.definition?.vendor || null;
    const detectedType = mapZ2MTypeToInternal(ieee, exposes, model, vendor);

    // Если классификатор не смог определить тип, но есть модель — пробуем AI
    if (!detectedType && model) {
      (async () => {
        try {
          const { detectDeviceTypeWithAI } = await import('./ai');
          const aiType = await detectDeviceTypeWithAI(exposes || [], model, vendor || '', null);
          if (aiType && aiType !== detectedType) {
            logger.log("[MQTT-WS] ", `🧠 AI предложил тип: ${aiType} для ${name} (${model})`);
            // Сохраняем AI-предложение как suggested_type в discovery_events
            try {
              db.prepare(`UPDATE discovery_events SET suggested_type = ? WHERE ieee_address = ? AND status = 'pending'`).run(aiType, ieee);
            } catch {}
          }
        } catch {}
      })();
    }

    try {
      stmt.insertDiscoveryEvent.run(ieee, name, model, vendor, detectedType, exposes ? JSON.stringify(exposes) : null);
    } catch (e: any) {
      logErrorWithLog(ieee, 'discovery_event_error', e.message);
    }
    logger.log("[MQTT-WS] ", `🔍 Device discovered via topic: ${friendlyName} (${model || 'pairing...'})`);

    broadcastDiscovery({
      type: 'device_discovered',
      ieee_address: ieee,
      friendly_name: name,
      model,
      vendor,
      suggested_type: detectedType,
      exposes,
    });
  } catch (e: any) {
    logErrorWithLog(ieee, 'discovery_error', e.message, friendlyName);
  }
}

// ── Bridge Event (device_joined / device_interview / device_announce) ──────
function handleBridgeEvent(data: any) {
  const info = data.data;
  if (!info?.ieee_address) return;
  const ieee = info.ieee_address;
  const shortIeee = ieee.replace('0x', '').slice(-8).toUpperCase();
  const name = info.friendly_name?.trim() && !info.friendly_name.startsWith('0x')
    ? info.friendly_name.trim()
    : `Датчик ${shortIeee}`;
  const model = info.definition?.model || info.model_id || null;
  const vendor = info.definition?.vendor || null;

  try {
    switch (data.type) {
      case 'device_joined':
        // Устройство только что подключилось к сети — мгновенный фидбек в UI,
        // до того как пройдёт (может занять секунды) интервью.
        stmt.insertDiscoveryEvent.run(ieee, name, null, null, null, null);
        logger.log("[MQTT-WS] ", `🆕 Device joined: ${name} — идёт настройка...`);
        broadcastDiscovery({ type: 'device_joined', ieee_address: ieee, friendly_name: name });
        break;
      case 'device_interview': {
        switch (info.status) {
          case 'started':
            logger.log("[MQTT-WS] ", `🔄 Interview started: ${name} (${ieee}) — настройка...`);
            break;
          case 'successful': {
            const exposes = info.definition?.exposes || null;
            const detectedType = mapZ2MTypeToInternal(ieee, exposes, model, vendor);
            stmt.insertDiscoveryEvent.run(ieee, name, model, vendor, detectedType, exposes ? JSON.stringify(exposes) : null);
            logger.log("[MQTT-WS] ", `✅ Interview successful: ${name} (${model}) — готов к подтверждению`);
            broadcastDiscovery({
              type: 'device_interview_success',
              ieee_address: ieee,
              friendly_name: name,
              model, vendor,
              suggested_type: detectedType,
              exposes,
            });
            break;
          }
          case 'failed':
            logErrorWithLog(ieee, 'interview_failed', `Interview failed for ${name}`, JSON.stringify(info));
            logger.log("[MQTT-WS] ", `❌ Interview failed: ${name} (${ieee}) — устройство не отвечает`);
            broadcastDiscovery({
              type: 'device_interview_failed',
              ieee_address: ieee,
              friendly_name: name,
              error: info.error || 'unknown',
            });
            break;
          default:
            logger.log("[MQTT-WS] ", `🌉 Bridge event — ${data.type}/${info.status}: ${name}`);
        }
        break;
      }

      case 'device_announce':
        // Устройство перезагрузилось/вернулось в сеть — только обновляем last_seen.
        // ЧИСТЫЙ UPDATE (не upsert) — если устройства нет в devices (ещё не
        // подтверждено пользователем), эта строка не должна появиться из-за
        // announce. Создание строки — исключительно через /api/discovery/:ieee/confirm.
        stmt.updateLastSeen.run(ieee);
        logger.log("[MQTT-WS] ", `🔄 Device announce (online): ${name}`);
        break;

      default:
        logger.log("[MQTT-WS] ", `🌉 Bridge event: ${data.type} — ${name}`);
    }
  } catch (e: any) {
    logErrorWithLog(ieee, 'bridge_event_error', e.message, data.type);
  }
}

// WebSocket broadcast helper
export function broadcastDiscovery(event: any) {
  if (!wss) return;
  const msg = JSON.stringify({ type: 'discovery', data: event });
  wss.clients.forEach((c: any) => {
    try { c.send(msg); } catch {}
  });
}

// ── Bridge Devices (full device list, приходит при (пере)подключении Z2M) ──
// Использует upsertDeviceFromDiscovery: не создаёт неподтверждённые устройства
// с нуля в потенциально неожиданных случаях... на практике Z2M присылает этот
// список для УЖЕ известных Z2M устройств, что не то же самое, что "подтверждённые
// пользователем" в нашем приложении. Поэтому здесь намеренно НЕ хардкодим room_id,
// и type/room не перезаписываются, если пользователь их менял вручную.
function handleBridgeDevices(devices: any) {
  if (!Array.isArray(devices)) return;
  for (const dev of devices) {
    if (dev.type === 'Coordinator' || dev.type === 'Router' || dev.disabled) continue;
    const ieee = dev.ieee_address || dev.ieeeAddr;
    const name = dev.friendly_name?.trim() || ieee;
    const model = dev.definition?.model || dev.model_id || null;
    const vendor = dev.definition?.vendor || null;
    try {
      const detectedType = mapZ2MTypeToInternal(ieee, dev.definition?.exposes || null, model, vendor);
      stmt.upsertDeviceFromDiscovery.run(ieee, name, model, vendor, detectedType, null);
      logger.log("[MQTT-WS] ", `📦 Bridge device: ${name} (${model})`);
    } catch (e: any) {
      logErrorWithLog(ieee, 'bridge_device_error', e.message, name);
    }
  }
}

// ── Real type mapping from Zigbee2MQTT exposes ──────────────────────────────
export function mapZ2MTypeToInternal(ieeeAddr: string, exposes: any[] | null, model?: string | null, vendor?: string | null): string | null {
  // 0. Сначала проверяем device_profiles (AI knowledge base) — самый надёжный источник
  if (model || vendor) {
    try {
      const profile = db.prepare(
        `SELECT detected_type FROM device_profiles WHERE model = ? AND (vendor = ? OR ? IS NULL) LIMIT 1`
      ).get(model || '', vendor || '', vendor) as { detected_type: string } | undefined;
      if (profile?.detected_type) {
        logger.log("[MQTT-WS] ", `📋 Profile match: ${model} → ${profile.detected_type}`);
        return profile.detected_type;
      }
    } catch {
      // device_profiles может не существовать — игнорируем
    }
  }

  // 1. Сначала проверяем suggested_type из discovery_events (пользователь уже выбрал тип)
  try {
    const event = db.prepare(
      `SELECT suggested_type FROM discovery_events WHERE ieee_address = ? ORDER BY id DESC LIMIT 1`
    ).get(ieeeAddr) as { suggested_type: string } | undefined;
    if (event?.suggested_type && event.suggested_type !== 'unknown') return event.suggested_type;
  } catch {
    // discovery_events может не существовать — игнорируем
  }

  // 2. Fallback: анализ exposes
  if (!exposes || !Array.isArray(exposes) || exposes.length === 0) return null;

  const types = new Set<string>();
  const features = new Set<string>();

  for (const expose of exposes) {
    if (expose.type) types.add(expose.type);
    if (expose.name) features.add(expose.name);
    if (expose.features && Array.isArray(expose.features)) {
      for (const f of expose.features) {
        if (f.type) types.add(f.type);
        if (f.name) features.add(f.name);
        if (f.property) features.add(f.property);
      }
    }
    if (expose.property) features.add(expose.property);
  }

  // ── ПРИОРИТЕТЫ (air quality ДО presence) ──
  // Air quality — сначала, чтобы Tuya CO2/VOC/PM не определялись как presence
  if (features.has('co2') || features.has('voc') || features.has('pm25') ||
      features.has('pm10') || features.has('formaldehyde') || features.has('air_quality')) {
    return 'air_monitor';
  }

  if (types.has('light')) return 'light';
  if (types.has('cover')) return 'gate';  // В этом доме cover-устройства — ворота/гараж, не шторы (Модуль 8, Находка 14)
  if (types.has('lock')) return 'lock';
  if (types.has('switch')) {
    if (features.has('brightness') || features.has('color')) return 'light';
    return 'plug';
  }
  if (types.has('climate')) return 'climate';
  if (types.has('fan')) return 'plug';

  if (features.has('lock_state')) return 'lock';
  if (features.has('contact')) return features.has('tamper') ? 'window_sensor' : 'door_sensor';

  // Presence — только после air quality
  if (features.has('presence')) return 'presence_sensor';
  if (features.has('occupancy')) return 'motion_sensor';
  if (features.has('water_leak')) return 'leak_sensor';
  if (features.has('smoke')) return 'smoke_sensor';

  if (features.has('temperature') || features.has('humidity') || features.has('pressure')) {
    return 'sensor';
  }

  // Air quality — высокий приоритет
  if (features.has('co2') || features.has('voc') || features.has('pm25') || 
      features.has('pm10') || features.has('formaldehyde') || features.has('air_quality')) {
    return 'air_monitor';
  }

  if (features.has('contact') || features.has('door') || features.has('window')) {
    return 'door_sensor';
  }

  if (features.has('battery') || features.has('voltage') || features.has('low_battery')) {
    return 'sensor';
  }

  if (features.has('illuminance') || features.has('light_level')) {
    return 'light_sensor';
  }

  return null; // ничего не определили — пользователь выберет вручную
}

// ── AI-enhanced detection with fallback chain ───────────────
// Асинхронная обёртка: синхронный profile + exposes, затем AI, сохраняет в profile
export async function detectDeviceTypeFull(
  ieeeAddr: string,
  exposes: any[] | null,
  model?: string | null,
  vendor?: string | null
): Promise<string | null> {
  // 1. Сначала синхронный классификатор (profile + exposes)
  const syncType = mapZ2MTypeToInternal(ieeeAddr, exposes, model, vendor);
  if (syncType) return syncType;

  // 2. Если ничего не дало — пробуем AI
  if (!model) return null;
  try {
    const { detectDeviceTypeWithAI } = await import('./ai');
    const stats = await getTelemetryStatsForDevice(ieeeAddr);
    const aiType = await detectDeviceTypeWithAI(exposes || [], model, vendor || '', stats);
    if (aiType) {
      logger.log("[MQTT-WS] ", `🧠 AI detection: ${model} → ${aiType}`);
      // Сохраняем в профиль, чтобы в следующий раз не звать AI
      try {
        const exposesHash = exposes
          ? require('crypto').createHmac('sha256', 'device-profile').update(JSON.stringify(exposes)).digest('hex').slice(0, 16)
          : null;
        stmt.saveDeviceProfile.run(model, vendor || '', exposesHash, aiType, null, null, null, null, null, null, null);
      } catch {}
      return aiType;
    }
  } catch (e: any) {
    logger.error("[MQTT-WS] ", `❌ AI detection error for ${model}: ${e.message}`);
  }
  return null;
}

// Получить статистику телеметрии для AI
async function getTelemetryStatsForDevice(ieeeAddr: string): Promise<any> {
  try {
    const rows = db.prepare(`
      SELECT property, MIN(value) as min_val, MAX(value) as max_val, ROUND(AVG(value), 1) as avg_val, COUNT(*) as cnt
      FROM telemetry WHERE device_ieee = ? GROUP BY property
    `).all(ieeeAddr) as any[];
    const stats: Record<string, any> = {};
    for (const r of rows) {
      stats[r.property] = { min: r.min_val, max: r.max_val, avg: r.avg_val, count: r.cnt };
    }
    return stats;
  } catch {
    return null;
  }
}

// ── Telemetry Handler ────────────────────────────────────
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

  if (!/^0x[0-9a-f]{16}$/i.test(ieee)) {
    logger.log("[MQTT-WS] ", `⏭️ Skipping telemetry from ${friendlyName}: invalid IEEE (${ieee})`);
    return;
  }

  // НАХОДКА (не было в прошлом отчёте): раньше здесь стоял upsertDeviceFromDiscovery,
  // а это INSERT ... ON CONFLICT — телеметрия от ЕЩЁ НЕ ПОДТВЕРЖДЁННОГО устройства
  // (ieee известен, но строки в devices нет) тихо создавала запись в обход
  // /api/discovery/:ieee/confirm, тем самым обходя весь флоу подтверждения.
  // Правильно — обновлять last_seen ТОЛЬКО если устройство уже существует;
  // если строки нет — updateLastSeen просто не затронет ни одной строки.
  try {
    stmt.updateLastSeen.run(ieee);
  } catch {}
  // Обновление battery_level в devices из телеметрии
  if (data.battery !== undefined && data.battery !== null) {
    try {
      stmt.updateBatteryLevel.run(Math.round(Number(data.battery)), ieee);
    } catch {}
  }

  // НАХОДКА (Модуль 2, при сверке со schemas.ts): раньше здесь не было co2, voc,
  // occupancy, pm10, tamper, battery_low, formaldehyde — эти поля ВАЛИДИРУЮТСЯ
  // Zod-схемой (MqttTelemetrySchema) и даже используются mapZ2MTypeToInternal для
  // классификации устройства (например occupancy → motion_sensor, co2/voc → air_monitor),
  // но сами значения никогда не сохранялись в telemetry. Из-за этого дефолтный
  // сценарий "Вентиляция по CO₂" в принципе не мог сработать — даже если бы
  // остальные баги (device-ключ, publishCommand) были исправлены, самих
  // значений co2 просто не было бы в БД для оценки условия.
  const propertyMap: Record<string, { value: any; unit: string }> = {
    temperature: { value: data.temperature, unit: '°C' },
    humidity: { value: data.humidity, unit: '%' },
    co2: { value: data.co2, unit: 'ppm' },
    voc: { value: data.voc, unit: 'ppb' },
    formaldehyde: { value: data.formaldehyde, unit: 'mg/m³' },
    pm25: { value: data.pm25, unit: 'µg/m³' },
    pm10: { value: data.pm10, unit: 'µg/m³' },
    illuminance: { value: data.illuminance ?? data.illuminance_lux, unit: 'lux' },
    soil_moisture: { value: data.soil_moisture, unit: '%' },
    pressure: { value: data.pressure, unit: 'hPa' },
    battery: { value: data.battery, unit: '%' },
    battery_low: { value: data.battery_low, unit: 'bool' },
    voltage: { value: data.voltage, unit: 'V' },
    current: { value: data.current, unit: 'A' },
    power: { value: data.power, unit: 'W' },
    energy: { value: data.energy, unit: 'kWh' },
    state: { value: data.state, unit: 'state' },
    presence: { value: data.presence ? 'present' : 'absent', unit: 'bool' },
    occupancy: { value: data.occupancy, unit: 'bool' },
    contact: { value: data.contact ? 'open' : 'closed', unit: 'bool' },
    tamper: { value: data.tamper, unit: 'bool' },
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

  // ── Пополнение device_profiles (min/max/avg) — первые 50 записей ──
  try {
    const countRow = db.prepare(
      `SELECT COUNT(*) as cnt FROM telemetry WHERE device_ieee = ?`
    ).get(ieee) as { cnt: number } | undefined;
    const telemetryCount = countRow?.cnt || 0;

    if (telemetryCount <= 50) {
      for (const [prop, { value }] of Object.entries(propertyMap)) {
        if (value === undefined || value === null) continue;
        const numericValue = typeof value === 'boolean'
          ? (value ? 1 : 0)
          : typeof value === 'string'
            ? (['ON', 'open', 'present', 'leak'].includes(value) ? 1 : 0)
            : value;

        // Берём min/max/avg из уже сохранённых значений
        const stats = db.prepare(`
          SELECT MIN(value) as min, MAX(value) as max, ROUND(AVG(value), 1) as avg
          FROM telemetry WHERE device_ieee = ? AND property = ?
        `).get(ieee, prop) as { min: number | null; max: number | null; avg: number | null };

        if (stats?.min !== null && stats?.max !== null && stats?.avg !== null) {
          db.prepare(`
            INSERT INTO device_profiles (model, vendor, parameters_json, last_seen_at)
            VALUES (
              (SELECT model FROM devices WHERE ieee_addr = ?),
              (SELECT vendor FROM devices WHERE ieee_addr = ?),
              json_set(COALESCE(parameters_json, '{}'), '$.' || ?,
                json_object('min', ?, 'max', ?, 'avg', ?)),
              datetime('now')
            )
            ON CONFLICT(model, vendor) DO UPDATE SET
              parameters_json = json_set(COALESCE(parameters_json, '{}'), '$.' || ?,
                json_object('min', ?, 'max', ?, 'avg', ?)),
              last_seen_at = datetime('now')
          `).run(ieee, ieee, prop, stats.min, stats.max, stats.avg,
                   prop, stats.min, stats.max, stats.avg);
        }
      }
    }
  } catch (e: any) {
    // device_profiles или json_set может не поддерживаться — игнорируем
    logErrorWithLog(ieee, 'profile_stats_error', e.message, 'min/max/avg update');
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

  if (stored > 0) {
    const sample = Object.entries(propertyMap)
      .filter(([, v]) => v.value !== undefined && v.value !== null)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${v.value}${v.unit}`)
      .join(' ');
    logger.log("[MQTT-WS] ", `📊 ${friendlyName}: ${sample}`);

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

    import('./engine').then(({ evaluateTelemetry }) => {
      const props: Record<string, number> = {};
      for (const [prop, meta] of Object.entries(propertyMap)) {
        const val = meta.value;
        if (val !== undefined && val !== null) {
          props[prop] = typeof val === 'boolean' ? (val ? 1 : 0)
            : typeof val === 'string' ? (['ON', 'open', 'present', 'leak'].includes(val) ? 1 : 0)
            : val;
        }
      }
      evaluateTelemetry(ieee, props).catch(e =>
        logErrorWithLog(ieee, 'scenario_eval_error', e.message, friendlyName)
      );
    }).catch(() => {});
  }
}

// ── WebSocket Server ─────────────────────────────────────
const WebSocketServer = require('ws').Server;

let wsAttached = false;

export function attachWebSocket(server: HTTPServer) {
  if (wsAttached) return; // Prevent double attachment
  wsAttached = true;

  // ═══ noServer mode — we handle upgrade manually for auth ═══
  const wssLocal: WSServer = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const keys = (process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      const apiKey = req.headers['x-api-key'] as string ||
        new URL(req.url || '/', `http://${req.headers.host}`).searchParams.get('api_key') as string;
      if (!apiKey || !keys.includes(apiKey)) {
        logger.log("[MQTT-WS] ", `🔌 WebSocket rejected: no valid auth (IP: ${req.socket.remoteAddress})`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    wssLocal.handleUpgrade(req, socket, head, (ws: WSClient) => {
      wssLocal.emit('connection', ws, req);
    });
  });

  // Load last presence from DB for motion/presence sensors (in case MQTT missed it)
  try {
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

  wssLocal.on('connection', (ws: WSClient) => {
    logger.log("[MQTT-WS] ", '🔌 WebSocket client connected');
    ws.on('close', () => logger.log("[MQTT-WS] ", '🔌 WebSocket client disconnected'));

    query(`SELECT * FROM telemetry ORDER BY ts DESC LIMIT 20`).then((rows: any[]) => {
      ws.send(JSON.stringify({ type: 'telemetry_init', data: rows }));
    }).catch(() => {});
  });

  setWSServer(wssLocal);

  logger.log("[MQTT-WS] ", '🔌 WebSocket: ws://localhost:8788/ws');
  return wssLocal;
}

export function sendDeviceCommand(deviceIeee: string, command: string, payload?: any): boolean {
  if (!client || !client.connected) {
    logErrorWithLog(deviceIeee, 'mqtt_publish_error', 'MQTT not connected', command);
    return false;
  }

  // Сначала буквальный поиск по ieee/name, потом резолвинг по типу
  const { target } = resolveDeviceTarget(deviceIeee);
  if (!target) {
    logErrorWithLog(deviceIeee, 'mqtt_publish_error', `Device not found: ${deviceIeee}`, command);
    return false;
  }

  const topic = `zigbee2mqtt/${target}/set`;
  const msg = JSON.stringify(payload ?? { state: command });
  client.publish(topic, msg);
  logger.log("[MQTT-WS] ", `📤 MQTT: ${topic} → ${msg}`);
  return true;
}

/**
 * Resolve device target: first by exact ieee/name match, then by type (sorted by lqi DESC).
 * Returns { target: string | null } — the friendly_name to use in MQTT topic.
 */
function resolveDeviceTarget(query_str: string): { target: string | null } {
  // 1. Буквальный поиск по ieee_addr или friendly_name
  const exact = db.prepare(
    `SELECT friendly_name FROM devices WHERE ieee_addr = ? OR friendly_name = ? LIMIT 1`
  ).get(query_str, query_str) as { friendly_name: string } | undefined;
  if (exact?.friendly_name) return { target: exact.friendly_name };

  // 2. Поиск по типу (модели) — берём устройство с лучшим LQI
  const byType = db.prepare(
    `SELECT d.friendly_name FROM devices d
     LEFT JOIN telemetry t ON t.device_ieee = d.ieee_addr AND t.property = 'lqi'
     WHERE d.type = ? OR d.model = ?
     ORDER BY t.value DESC
     LIMIT 1`
  ).get(query_str, query_str) as { friendly_name: string } | undefined;
  if (byType?.friendly_name) return { target: byType.friendly_name };

  // 3. Fallback — используем query как есть (для обратной совместимости)
  return { target: query_str };
}

export { client, lastPresenceAt, sendDeviceCommand as publishCommand };

/** MQTT connection status (для /api/zigbee/status) */
export let mqttConnected = false;
/** Permit join активен? */
export let permitJoinActive = false;
/** Осталось секунд permit_join */
export let permitJoinTimeLeft = 0;

/**
 * Синхронизировать состояние permit_join из ответа Z2M bridge/config
 */
export function syncPermitFromZ2M(state: { permit_join?: boolean; permit_join_end?: string | number }): void {
  const isOpen = state?.permit_join || false;
  if (isOpen !== permitJoinActive) {
    logger.info(`[MQTT-WS] permit_join sync: SmartE=${permitJoinActive} → Z2M=${isOpen}`);
    permitJoinActive = isOpen;
  }
  permitJoinTimeLeft = state?.permit_join_end
    ? Math.max(0, Math.round(Number(state.permit_join_end) - Date.now() / 1000))
    : 0;
}

/**
 * Опубликовать команду permit_join через основное MQTT-подключение.
 */
export function publishPermitJoin(value: boolean, time: number = 120): boolean {
  if (!client || !client.connected) {
    logger.log("[MQTT-WS] ", '📡 MQTT not connected, cannot publish permit_join');
    return false;
  }
  const topic = 'zigbee2mqtt/bridge/request/permit_join';
  const payload = JSON.stringify({ value, time });
  client.publish(topic, payload, { qos: 1 });
  logger.log("[MQTT-WS] ", `📡 permit_join published: ${topic} → ${payload}`);
  return true;
}

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
