import { query, logErrorWithLog, logCommand, logStateChange, logScenarioExec } from './db';
import { publishCommand } from './mqtt-ws';
import { createHmac } from 'crypto';
import { URL } from 'url';
import logger from './logger';

// ── Конфигурация webhook ───
// Пока захардкожено, позже вынести в config/
const WEBHOOK_ALLOWED_DOMAINS = new Set([
  'localhost', '127.0.0.1', 'api.telegram.org', 'hooks.slack.com',
  'hooks.slack.svc',
]);
const WEBHOOK_SIGNING_SECRET = process.env.WEBHOOK_SIGNING_SECRET || '';

// ── Action types ──────────────────────────────────────────
export interface ScenarioAction {
  type: 'device_command' | 'mqtt' | 'notify' | 'delay' | 'group' | 'scene' |
        'notification' | 'group_command' | 'set_house_mode' | 'call_scenario' |
        'webhook' | 'mqtt_publish' | 'voice_announce' | 'run_script' |
        'set_variable' | 'if_then_else' | 'repeat' | 'stop';
  device?: string;
  command?: string;
  payload?: any;
  message?: string;
  delay_ms?: number;        // Задержка перед конкретным действием (мс)
  duration_ms?: number;     // Для type: 'delay' — длительность паузы
  room_id?: number;
  device_type?: string;
  title?: string;
  body?: string;
  scene_id?: number;
  scene_name?: string;
  scenario_name?: string; // For call_scenario action — name of target scenario
  mode?: string;
  scenario_id?: number;
  url?: string;
  method?: string;
  topic?: string;
  text?: string;
  condition?: any;
  then?: ScenarioAction[];
  else?: ScenarioAction[];
  actions?: ScenarioAction[];
  count?: number;
  key?: string;
  value?: any;
}

// ── Parse Helpers ────────────────────────────────────────

const VALID_ACTION_TYPES = new Set([
  'device_command', 'mqtt', 'notify', 'delay', 'group', 'scene',
  'notification', 'group_command', 'set_house_mode', 'call_scenario',
  'webhook', 'mqtt_publish', 'voice_announce', 'run_script',
  'set_variable', 'if_then_else', 'repeat', 'stop',
]);

export function parseActions(json: string): ScenarioAction[] | null {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    if (parsed.length === 0) return null;
    for (const a of parsed) {
      if (!a.type || !VALID_ACTION_TYPES.has(a.type)) return null;
    }
    return parsed as ScenarioAction[];
  } catch {
    return null;
  }
}

// ── Action Dispatcher ────────────────────────────────────

export async function executeAction(action: ScenarioAction, scenarioName: string): Promise<{ ok: boolean; error?: string }> {
  // Задержка перед действием (delay_ms)
  if (action.delay_ms && action.delay_ms > 0) {
    await sleep(action.delay_ms);
  }

  switch (action.type) {
    case 'device_command':
    case 'mqtt':
      return executeMqttAction(action, scenarioName);
    case 'delay':
      if (action.duration_ms && action.duration_ms > 0) {
        await sleep(action.duration_ms);
      }
      return { ok: true };
    case 'notify':
    case 'notification':
      return executeNotifyAction(action, scenarioName);
    case 'group':
    case 'group_command':
      return executeGroupAction(action, scenarioName);
    case 'set_house_mode':
      return executeSetHouseMode(action, scenarioName);
    case 'if_then_else':
      return executeIfThenElse(action, scenarioName);
    case 'call_scenario':
      return executeCallScenario(action, scenarioName);
    case 'webhook':
      return executeWebhookAction(action, scenarioName);
    case 'stop':
      return { ok: true, error: 'stopped' };
    default:
      logger.warn("[ACTIONS] ", `⚠️ Unknown action type: ${action.type}`);
      return { ok: false, error: `Unknown action type: ${action.type}` };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Shared Command Dispatcher ────────────────────────────

export async function sendDeviceCommand(
  ieee: string,
  command: string,
  source: string,
  oldState?: string,
  newState?: string
): Promise<{ ok: boolean; commandId: number; error?: string }> {
  const cmdId = logCommand(ieee, command, '{}', source);
  const sent = publishCommand(ieee, command);

  if (sent) {
    if (oldState !== undefined && newState !== undefined) {
      logStateChange(ieee, oldState, newState, source);
    }
    await query(
      `UPDATE commands SET status = 'success', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      cmdId
    ).catch(() => {});
    return { ok: true, commandId: cmdId };
  } else {
    await query(
      `UPDATE commands SET status = 'error', error_msg = 'MQTT not connected', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      cmdId
    ).catch(() => {});
    return { ok: false, commandId: cmdId, error: 'MQTT недоступен, команда не отправлена' };
  }
}

async function resolveActionTargets(deviceRef: string): Promise<string[]> {
  try {
    const literal = await query('SELECT ieee_addr FROM devices WHERE ieee_addr = ?', deviceRef);
    if (literal.length > 0) return [deviceRef];
  } catch {
    // проверка не удалась — попробуем резолвинг по типу ниже
  }
  try {
    const rows = await query(`SELECT ieee_addr FROM devices WHERE type = ?`, deviceRef);
    return (rows as any[]).map(r => r.ieee_addr);
  } catch {
    return [];
  }
}

async function executeMqttAction(action: ScenarioAction, scenarioName: string): Promise<{ ok: boolean; error?: string }> {
  if (!action.device || !action.command) {
    logErrorWithLog(null, 'scenario_action_error', 'Missing device or command', scenarioName);
    return { ok: false, error: 'Missing device or command' };
  }

  const targets = await resolveActionTargets(action.device);

  if (targets.length === 0) {
    logErrorWithLog(null, 'scenario_action_error',
      `Ни одно устройство не найдено для "${action.device}" — команда не отправлена`, scenarioName);
    return { ok: false, error: `No device found for ${action.device}` };
  }

  let allOk = true;
  let lastError: string | undefined;
  for (const ieee of targets) {
    const cmdId = logCommand(ieee, action.command, JSON.stringify(action.payload || {}), 'scenario');
    const sent = publishCommand(ieee, action.command, action.payload);

    if (sent) {
      logStateChange(ieee, '?', action.command, `scenario:${scenarioName}`);
      await query(
        `UPDATE commands SET status = 'success', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        cmdId
      ).catch(() => {});
      logger.log("[ACTIONS] ", `🎬 [${scenarioName}] → ${ieee}: ${action.command}`);
    } else {
      allOk = false;
      lastError = 'MQTT not connected';
      await query(
        `UPDATE commands SET status = 'error', error_msg = 'MQTT not connected', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        cmdId
      ).catch(() => {});
      logErrorWithLog(ieee, 'scenario_action_error', 'publishCommand вернул false (MQTT не подключен?)', scenarioName);
    }
  }

  return { ok: allOk, error: lastError };
}

// ── Group Action ─────────────────────────────────────────

async function executeGroupAction(action: ScenarioAction, scenarioName: string): Promise<{ ok: boolean; error?: string; firedCount?: number }> {
  if (action.room_id == null || !action.device_type || !action.command) {
    logErrorWithLog(null, 'scenario_action_error',
      'Group-действие требует room_id, device_type и command', scenarioName);
    return { ok: false, error: 'Missing room_id, device_type or command' };
  }

  let members: { ieee_addr: string }[];
  try {
    members = await query(
      `SELECT ieee_addr FROM devices WHERE room_id = ? AND type = ?`,
      action.room_id, action.device_type
    );
  } catch (e: any) {
    logErrorWithLog(null, 'scenario_action_error', e.message, scenarioName);
    return { ok: false, error: e.message };
  }

  if (members.length === 0) {
    logErrorWithLog(null, 'scenario_action_error',
      `Нет устройств типа "${action.device_type}" в комнате #${action.room_id} — команда не отправлена`, scenarioName);
    return { ok: false, error: 'No devices in group' };
  }

  // Check priority level from caller context for manual_overrides
  // (передаётся через executeActions, который знает scenario.priorityLevel)
  let allOk = true;
  let lastError: string | undefined;
  let firedCount = 0;
  for (const { ieee_addr } of members) {
    // Проверка manual_override (заготовка на будущее, полноценно в Фазе 3)
    try {
      const overrides = await query(
        `SELECT id FROM manual_overrides WHERE device_ieee = ? AND expires_at > datetime('now') LIMIT 1`,
        ieee_addr
      );
      if ((overrides as any[]).length > 0) {
        // Если активный override существует — пропускаем (правило для Фазы 3)
        logger.log("[ACTIONS] ", `⏭️ [${scenarioName}] групповое: ${ieee_addr} пропущен (manual_override)`);
        continue;
      }
    } catch { /* manual_overrides ещё может не существовать */ }
    const cmdId = logCommand(ieee_addr, action.command, '{}', 'scenario_group');
    const sent = publishCommand(ieee_addr, action.command);

    if (sent) {
      firedCount++;
      logStateChange(ieee_addr, '?', action.command, `scenario:${scenarioName}`);
      await query(
        `UPDATE commands SET status = 'success', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        cmdId
      ).catch(() => {});
      logger.log("[ACTIONS] ", `🎬 [${scenarioName}] группа → ${ieee_addr}: ${action.command}`);
    } else {
      allOk = false;
      lastError = 'MQTT not connected';
      await query(
        `UPDATE commands SET status = 'error', error_msg = 'MQTT not connected', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        cmdId
      ).catch(() => {});
      logErrorWithLog(ieee_addr, 'scenario_action_error', 'publishCommand вернул false (MQTT не подключен?)', scenarioName);
    }
  }

  return { ok: allOk, error: lastError, firedCount };
}

// ── Set House Mode Action ────────────────────────────────

async function executeSetHouseMode(action: ScenarioAction, scenarioName: string): Promise<{ ok: boolean; error?: string }> {
  const mode = action.mode;
  if (!mode) {
    logErrorWithLog(null, 'scenario_action_error', 'Missing mode for set_house_mode', scenarioName);
    return { ok: false, error: 'Missing mode' };
  }
  try {
    const rows = await query('SELECT name FROM house_modes WHERE name = ?', mode);
    if (!rows.length) {
      logErrorWithLog(null, 'scenario_action_error', `Invalid house mode: ${mode}`, scenarioName);
      return { ok: false, error: `Invalid house mode: ${mode}` };
    }
    // Используем динамический импорт, чтобы избежать циклической зависимости
    const engine = await import('./engine');
    engine.setCurrentHouseMode(mode);
    engine.reloadScenarios().catch(() => {});
    logger.log("[ACTIONS] ", `🏠 [${scenarioName}] house_mode set to: ${mode}`);
    return { ok: true };
  } catch (e: any) {
    logErrorWithLog(null, 'scenario_action_error', e.message, scenarioName);
    return { ok: false, error: e.message };
  }
}

// ── Webhook Action with allowlist ────────────────────────

async function executeWebhookAction(action: ScenarioAction, scenarioName: string): Promise<{ ok: boolean; error?: string }> {
  const url = action.url;
  const method = (action.method || 'POST').toUpperCase();
  const body = action.body || action.payload || {};

  if (!url) {
    logErrorWithLog(null, 'scenario_action_error', 'Missing url for webhook action', scenarioName);
    return { ok: false, error: 'Missing url' };
  }

  // Проверка allowlist
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (!WEBHOOK_ALLOWED_DOMAINS.has(hostname)) {
      logErrorWithLog(null, 'scenario_action_error',
        `Webhook domain not allowed: ${hostname}`, scenarioName);
      return { ok: false, error: `Webhook domain not allowed: ${hostname}` };
    }
  } catch {
    logErrorWithLog(null, 'scenario_action_error', `Invalid webhook URL: ${url}`, scenarioName);
    return { ok: false, error: `Invalid webhook URL: ${url}` };
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Опциональная HMAC-подпись
    if (WEBHOOK_SIGNING_SECRET) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      const signature = createHmac('sha256', WEBHOOK_SIGNING_SECRET).update(bodyStr).digest('hex');
      headers['X-Smart-Estate-Signature'] = signature;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    logger.log("[ACTIONS] ", `🌐 [${scenarioName}] webhook ${method} ${url} → ${response.status}`);
    return { ok: response.ok };
  } catch (e: any) {
    logErrorWithLog(null, 'scenario_action_error',
      `Webhook error: ${e.message}`, scenarioName);
    return { ok: false, error: `Webhook error: ${e.message}` };
  }
}

// ── Notify Action ────────────────────────────────────────

async function executeNotifyAction(action: ScenarioAction, scenarioName: string): Promise<{ ok: boolean; error?: string }> {
  const message = action.message || action.body || '';
  if (!message) {
    logErrorWithLog(null, 'scenario_action_error', 'Missing message', scenarioName);
    return { ok: false, error: 'Missing message' };
  }

  try {
    await query(
      `INSERT INTO state_changes (device_ieee, old_state, new_state, reason)
       VALUES ('system', 'idle', 'notify', ?)`,
      `scenario:${scenarioName}: ${message}`
    );
    logger.log("[ACTIONS] ", `🔔 [${scenarioName}] NOTIFY: ${message}`);
    return { ok: true };
  } catch (e: any) {
    logErrorWithLog(null, 'scenario_action_error', e.message, scenarioName);
    return { ok: false, error: e.message };
  }
}

// ── Batch Executor ───────────────────────────────────────

/**
 * Выполняет массив действий последовательно с поддержкой задержек.
 * 
 * - delay_ms на конкретном действии: ждём перед выполнением этого действия.
 * - Отдельное действие "delay": просто ждём duration_ms.
 * - timeout_sec: если суммарное время превысило лимит — прерываем.
 * - Ошибка одного действия не роняет весь процесс.
 */
export async function executeActions(
  actions: ScenarioAction[],
  scenarioName: string,
  timeoutSec: number = 0
): Promise<{ fired: number; errors: string[] }> {
  let fired = 0;
  const errors: string[] = [];
  const startedAt = Date.now();

  for (const action of actions) {
    // Проверка timeout
    if (timeoutSec > 0) {
      const elapsed = (Date.now() - startedAt) / 1000;
      if (elapsed >= timeoutSec) {
        errors.push(`timeout: execution exceeded ${timeoutSec}s`);
        break;
      }
    }

    try {
      fired++;
      const result = await executeAction(action, scenarioName);
      if (!result.ok && result.error) {
        errors.push(result.error);
      }
    } catch (e: any) {
      errors.push(e.message);
      logErrorWithLog(null, 'scenario_action_error', e.message, scenarioName);
    }
  }

  return { fired, errors };
}

// ── If/Then/Else ──────────────────────────────────────────

async function executeIfThenElse(action: ScenarioAction, scenarioName: string): Promise<{ ok: boolean; error?: string }> {
  const condition = action.condition;
  if (!condition) {
    return { ok: false, error: 'Missing condition for if_then_else' };
  }

  let result: boolean;

  try {
    result = await evaluateCondition(condition);
  } catch (e: any) {
    logErrorWithLog(null, 'scenario_action_error', `Condition eval error: ${e.message}`, scenarioName);
    return { ok: false, error: `Condition eval error: ${e.message}` };
  }

  const branch = result ? action.then : action.else;

  if (branch && Array.isArray(branch) && branch.length > 0) {
    // Рекурсивно выполняем действия ветки
    for (const childAction of branch) {
      try {
        const res = await executeAction(childAction, scenarioName);
        if (!res.ok && res.error) {
          logErrorWithLog(null, 'scenario_action_error',
            `if_then_else branch action error: ${res.error}`, scenarioName);
        }
      } catch (e: any) {
        logErrorWithLog(null, 'scenario_action_error',
          `if_then_else branch action exception: ${e.message}`, scenarioName);
      }
    }
  }

  logger.log("[ACTIONS] ", `🔀 [${scenarioName}] if_then_else → ${result ? 'THEN' : 'ELSE'}`);
  return { ok: true };
}

async function evaluateCondition(condition: any): Promise<boolean> {
  // Поддерживаем: { "device_ieee": "0x...", "state": "ON" | "OFF" }
  // и { "variable": "var_name", "operator": "eq"|"neq"|"gt"|"lt", "value": ... }

  if (condition.device_ieee && condition.state !== undefined) {
    // Проверка состояния устройства
    const rows = await query(
      `SELECT state FROM devices WHERE ieee_addr = ? LIMIT 1`,
      condition.device_ieee
    );
    if (!rows.length) return false;
    const currentState = (rows as any[])[0].state;
    return String(currentState) === String(condition.state);
  }

  if (condition.variable && condition.operator !== undefined) {
    // Проверка переменной сценария (из переменных окружения или runtime)
    const currentVal = (global as any).__scenario_vars?.[condition.variable];
    const targetVal = condition.value;

    switch (condition.operator) {
      case 'eq': return currentVal == targetVal;
      case 'neq': return currentVal != targetVal;
      case 'gt': return Number(currentVal) > Number(targetVal);
      case 'lt': return Number(currentVal) < Number(targetVal);
      default: return false;
    }
  }

  return false;
}

// ── Call Scenario ─────────────────────────────────────────

async function executeCallScenario(action: ScenarioAction, scenarioName: string): Promise<{ ok: boolean; error?: string }> {
  const targetName = action.scenario_name || action.scene_name;
  if (!targetName) {
    return { ok: false, error: 'Missing scenario_name for call_scenario' };
  }

  try {
    const engine = await import('./engine');
    const result = await engine.executeScenarioByName(targetName);
    logger.log("[ACTIONS] ", `📞 [${scenarioName}] called scenario "${targetName}" → ${result ? 'ok' : 'failed'}`);
    return { ok: result };
  } catch (e: any) {
    logErrorWithLog(null, 'scenario_action_error',
      `call_scenario error: ${e.message}`, scenarioName);
    return { ok: false, error: `call_scenario error: ${e.message}` };
  }
}
