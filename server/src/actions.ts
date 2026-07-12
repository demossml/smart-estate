import { query, logErrorWithLog, logCommand, logStateChange } from './db';
import { publishCommand } from './mqtt-ws';
import logger from './logger';

// Action types
export interface ScenarioAction {
  type: 'mqtt' | 'notify';
  device?: string;
  command?: string;
  payload?: any;
  message?: string;
}


// ── Action Dispatcher ────────────────────────────────────

export async function executeAction(action: ScenarioAction, scenarioName: string): Promise<boolean> {
  switch (action.type) {
    case 'mqtt':
      return executeMqttAction(action, scenarioName);
    case 'notify':
      return executeNotifyAction(action, scenarioName);
    default:
      logger.warn("[ACTIONS] ", `⚠️ Unknown action type: ${(action as any).type}`);
      return false;
  }
}

// ── Shared Command Dispatcher ────────────────────────────
//
// НАХОДКА (Модуль 7, api.ts): один и тот же баг — "logCommand пишет success,
// publishCommand не вызывается" — нашёлся в 7 РАЗНЫХ местах api.ts (devices
// on/off, gates open/close, groups all-on/off, 4 ветки /api/voice). Патчить
// их точечно по одному — значит гарантированно пропустить следующее такое
// же место в непроверенном коде. Это ЕДИНАЯ точка входа: log + publish +
// обновление статуса + logStateChange, для использования из api.ts вместо
// ручного дублирования той же последовательности вызовов.
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
  // НАХОДКА (Модуль 5, demo.ts): раньше здесь был регекс "0x"+16hex, который
  // не распознавал демо-идентификаторы вида "demo:kitchen_fan" (тоже реальные
  // значения devices.ieee_addr, просто другого формата) — демо-сценарии
  // ошибочно резолвились как "тип устройства" и ничего не находили.
  // Теперь проверяем по факту: существует ли такой ieee_addr буквально.
  try {
    const literal = await query('SELECT ieee_addr FROM devices WHERE ieee_addr = ?', deviceRef);
    if (literal.length > 0) return [deviceRef];
  } catch {
    // проверка не удалась — попробуем резолвинг по типу ниже
  }
  // Не найдено буквально — deviceRef это тип-заглушка ("air_monitor" и т.п.),
  // резолвим в реальные устройства этого типа.
  try {
    const rows = await query(`SELECT ieee_addr FROM devices WHERE type = ?`, deviceRef);
    return (rows as any[]).map(r => r.ieee_addr);
  } catch {
    return [];
  }
}

async function executeMqttAction(action: ScenarioAction, scenarioName: string): Promise<boolean> {
  if (!action.device || !action.command) {
    logErrorWithLog(null, 'scenario_action_error', 'Missing device or command', scenarioName);
    return false;
  }

  const targets = await resolveActionTargets(action.device);

  if (targets.length === 0) {
    // НАХОДКА: раньше это молча "срабатывало" (писало success в БД), даже если
    // ни одного реального устройства с таким типом/адресом не существовало.
    // Теперь — явная ошибка в лог, чтобы было видно, что сценарий настроен
    // на несуществующее устройство/тип, а не тихо ничего не делал.
    logErrorWithLog(null, 'scenario_action_error',
      `Ни одно устройство не найдено для "${action.device}" — команда не отправлена`, scenarioName);
    return false;
  }

  let allOk = true;
  for (const ieee of targets) {
    // НАХОДКА (главная за весь аудит): раньше здесь только логировался
    // "успех" в таблицу commands, но publishCommand() НИКОГДА не вызывался —
    // ни одна MQTT-команда из сценария реально не уходила на устройство.
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
      await query(
        `UPDATE commands SET status = 'error', error_msg = 'MQTT not connected', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        cmdId
      ).catch(() => {});
      logErrorWithLog(ieee, 'scenario_action_error', 'publishCommand вернул false (MQTT не подключен?)', scenarioName);
    }
  }

  return allOk;
}

async function executeNotifyAction(action: ScenarioAction, scenarioName: string): Promise<boolean> {
  if (!action.message) {
    logErrorWithLog(null, 'scenario_action_error', 'Missing message', scenarioName);
    return false;
  }

  try {
    await query(
      `INSERT INTO state_changes (device_ieee, old_state, new_state, reason)
       VALUES ('system', 'idle', 'notify', ?)`,
      `scenario:${scenarioName}: ${action.message}`
    );
    logger.log("[ACTIONS] ", `🔔 [${scenarioName}] NOTIFY: ${action.message}`);
    return true;
  } catch (e: any) {
    logErrorWithLog(null, 'scenario_action_error', e.message, scenarioName);
    return false;
  }
}

// ── Batch Executor ───────────────────────────────────────

export async function executeActions(
  actions: ScenarioAction[],
  scenarioName: string
): Promise<{ fired: number; success: number; errors: string[] }> {
  let fired = 0;
  let success = 0;
  const errors: string[] = [];

  for (const action of actions) {
    try {
      fired++;
      const ok = await executeAction(action, scenarioName);
      if (ok) success++;
      else errors.push(`Action ${action.type} failed`);
    } catch (e: any) {
      errors.push(e.message);
      logErrorWithLog(null, 'scenario_action_error', e.message, scenarioName);
    }
  }

  return { fired, success, errors };
}

// ── Parse Helpers ────────────────────────────────────────

export function parseActions(json: string): ScenarioAction[] | null {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    for (const a of parsed) {
      if (!a.type || !['mqtt', 'notify'].includes(a.type)) return null;
    }
    return parsed as ScenarioAction[];
  } catch {
    return null;
  }
}
