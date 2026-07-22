import { query, logErrorWithLog, logScenarioExec } from './db';
import { parseTriggers, getTriggerKeys, TriggerCondition } from './triggers';
import { executeActions, parseActions, ScenarioAction } from './actions';
import { timerManager } from './timer-manager';
import { debounceManager } from './debounce-manager';
import { cleanExpiredOverrides } from './override-manager';
import webpush from 'web-push';
import logger from './logger';

// ── Scenario Engine ──────────────────────────────────────

interface LoadedScenario {
  id: number;
  name: string;
  triggers: TriggerCondition[];
  triggerLogic: 'ANY' | 'ALL';  // ANY = любой триггер, ALL = все триггеры
  conditionsJson: string | null;
  actions: ScenarioAction[];
  priorityLevel: number;
  enabledHouseModes: string[];
  cooldown_ms: number;
  debounce_ms: number;          // Debounce перед срабатыванием (мс)
  last_fired: number;           // timestamp
  run_mode: string;             // single | queued | restart | parallel
  timeout_sec: number;          // авто-отмена выполнения
}

// Cooldown: minimum interval between scenario fires (default 2s)
const DEFAULT_COOLDOWN_MS = 2000;

// Cache of loaded scenarios
let scenarios: LoadedScenario[] = [];
// Trigger index: "device:property" -> [scenario_ids]
let triggerIndex: Map<string, number[]> = new Map();

// Current house mode
let currentHouseMode: string = 'home';

// ── Run-mode tracking ────────────────────────────────────
// scenario.id -> Promise that resolves when current execution finishes
const runningScenarios = new Map<number, Promise<void>>();
// scenario.id -> abort function (for 'restart' mode)
const runModeAborts = new Map<number, () => void>();

async function executeWithRunMode(
  scenario: LoadedScenario,
  execFn: () => Promise<void>
): Promise<void> {
  const sid = scenario.id;
  const mode = scenario.run_mode || 'single';

  switch (mode) {
    case 'parallel':
      // Просто запускаем — не трекаем
      execFn().catch(e => logger.error("[ENGINE] ", `run_mode parallel error #${sid}: ${e.message}`));
      break;

    case 'restart': {
      // Прерываем текущее выполнение, если есть
      const abort = runModeAborts.get(sid);
      if (abort) {
        logger.log("[ENGINE] ", `🔄 [scenario #${sid}] ${scenario.name} restart — aborting previous run`);
        abort();
      }
      const controller = new AbortController();
      runModeAborts.set(sid, () => controller.abort());
      const running = execFn();
      running.finally(() => {
        // Clean up only if this is still our controller
        if (runModeAborts.get(sid) === (() => controller.abort())) {
          runModeAborts.delete(sid);
        }
      });
      break;
    }

    case 'queued': {
      // Цепочка: после завершения текущего — запускаем следующий
      const previous = runningScenarios.get(sid) || Promise.resolve();
      const nextExec = previous.then(() => execFn());
      runningScenarios.set(sid, nextExec.then(() => {}).catch(() => {}));
      break;
    }

    case 'single':
    default: {
      // По умолчанию: если предыдущий ещё бежит — скипаем
      if (runningScenarios.has(sid)) {
        logger.log("[ENGINE] ", `⏭️ [scenario #${sid}] ${scenario.name} single — already running, skipping`);
        return;
      }
      const running = execFn();
      runningScenarios.set(sid, running.then(() => {}).catch(() => {}));
      running.finally(() => {
        runningScenarios.delete(sid);
      });
      break;
    }
  }
}

export function getCurrentHouseMode(): string {
  return currentHouseMode;
}

export function setCurrentHouseMode(mode: string): void {
  currentHouseMode = mode;
  logger.log("[ENGINE] ", `🏠 Режим дома изменён на: ${mode}`);
}

// ── Condition Evaluators ─────────────────────────────────

function evaluateDeviceState(device: string, property: string, operator: string, value: number, telemetryMap: Map<string, number>): boolean {
  const key = `${device}:${property}`;
  const currentValue = telemetryMap.get(key);
  if (currentValue === undefined) return false;
  switch (operator) {
    case '>':  return currentValue > value;
    case '<':  return currentValue < value;
    case '>=': return currentValue >= value;
    case '<=': return currentValue <= value;
    case '=':  return currentValue === value;
    case '!=': return currentValue !== value;
    default:   return false;
  }
}

function evaluateTrigger(trigger: TriggerCondition, telemetryMap: Map<string, number>): boolean {
  return evaluateDeviceState(trigger.device, trigger.property, trigger.operator, trigger.value, telemetryMap);
}

export function evaluateConditions(conditionsJson: string | null, telemetryMap: Map<string, number>, houseMode: string): boolean {
  if (!conditionsJson) return true; // Нет условий — пропускаем guard

  try {
    const conds = JSON.parse(conditionsJson);
    // conditionsJson может быть массивом (все AND) или объектом { logic, items/groups }
    let items: any[] = [];
    let logic = 'ALL';

    if (Array.isArray(conds)) {
      items = conds;
    } else if (conds.items && Array.isArray(conds.items)) {
      items = conds.items;
      logic = conds.logic || 'ALL';
    } else {
      return true; // Неизвестный формат — пропускаем
    }

    if (items.length === 0) return true;

    const results: boolean[] = [];

    for (const item of items) {
      // Вложенная группа
      if (item.logic && item.conditions) {
        // Рекурсия для группы
        const subResult = evaluateItemList(item.conditions, item.logic, telemetryMap, houseMode);
        results.push(subResult);
        continue;
      }

      switch (item.type) {
        case 'device_state':
          results.push(evaluateDeviceState(item.device, item.property, item.operator, item.value, telemetryMap));
          break;
        case 'numeric_range': {
          const val = telemetryMap.get(`${item.device}:${item.property}`);
          if (val === undefined) { results.push(false); break; }
          const minOk = item.min !== undefined ? val >= item.min : true;
          const maxOk = item.max !== undefined ? val <= item.max : true;
          results.push(minOk && maxOk);
          break;
        }
        case 'time_range': {
          // Простой диапазон HH:MM
          const now = new Date();
          const currentMin = now.getHours() * 60 + now.getMinutes();
          const fromMin = item.from ? parseInt(item.from.split(':')[0]) * 60 + parseInt(item.from.split(':')[1]) : 0;
          const toMin = item.to ? parseInt(item.to.split(':')[0]) * 60 + parseInt(item.to.split(':')[1]) : 1439;
          results.push(currentMin >= fromMin && currentMin <= toMin);
          break;
        }
        case 'mode': {
          const modes: string[] = item.house_mode || [];
          const invert = item.not === true;
          const match = modes.includes(houseMode);
          results.push(invert ? !match : match);
          break;
        }
        case 'presence': {
          // Присутствие в комнате: проверяем через телеметрию датчиков в комнате
          // Для простоты — считаем что условие выполнено, если есть любой датчик с presence=1 в этой комнате
          // Полная реализация потребует JOIN с devices и telemetry
          // Пока — заглушка (считаем что условие выполнено)
          results.push(true);
          break;
        }
        default:
          // Неизвестный тип — пропускаем (считаем true)
          results.push(true);
      }
    }

    if (logic === 'ANY') return results.some(r => r);
    return results.every(r => r);
  } catch {
    return true; // Ошибка парсинга — пропускаем guard
  }
}

function evaluateItemList(items: any[], logic: string, telemetryMap: Map<string, number>, houseMode: string): boolean {
  const results: boolean[] = [];
  for (const item of items) {
    if (item.logic && item.conditions) {
      results.push(evaluateItemList(item.conditions, item.logic, telemetryMap, houseMode));
    } else {
      switch (item.type) {
        case 'device_state':
          results.push(evaluateDeviceState(item.device, item.property, item.operator, item.value, telemetryMap));
          break;
        case 'numeric_range': {
          const val = telemetryMap.get(`${item.device}:${item.property}`);
          if (val === undefined) { results.push(false); break; }
          const minOk = item.min !== undefined ? val >= item.min : true;
          const maxOk = item.max !== undefined ? val <= item.max : true;
          results.push(minOk && maxOk);
          break;
        }
        default:
          results.push(true);
      }
    }
  }
  if (logic === 'ANY') return results.some(r => r);
  return results.every(r => r);
}

// ── Engine Lifecycle ─────────────────────────────────────

export async function reloadScenarios(): Promise<void> {
  try {
    const rows = await query(`SELECT * FROM scenarios WHERE active = true ORDER BY id`);
    const newScenarios: LoadedScenario[] = [];
    const newIndex = new Map<string, number[]>();

    const deviceRows = await query(`SELECT ieee_addr, type FROM devices`);
    const allDeviceIeees = new Set<string>((deviceRows as any[]).map(d => d.ieee_addr));
    const devicesByType = new Map<string, string[]>();
    for (const d of deviceRows as any[]) {
      if (!d.type) continue;
      const arr = devicesByType.get(d.type) || [];
      arr.push(d.ieee_addr);
      devicesByType.set(d.type, arr);
    }

    for (const row of rows) {
      const triggers = parseTriggers(row.triggers_json);
      const actions = parseActions(row.actions_json);

      if (!triggers || !actions) {
        logErrorWithLog(null, 'scenario_parse_error',
          `Invalid triggers or actions for scenario #${row.id}`, row.name);
        continue;
      }

      const existing = scenarios.find(s => s.id === row.id);

      // Parse enabled_house_modes
      let enabledModes: string[] = ['home', 'away', 'night', 'sleep', 'guest', 'vacation', 'work'];
      try {
        if (row.enabled_house_modes) {
          const parsed = JSON.parse(row.enabled_house_modes);
          if (Array.isArray(parsed)) enabledModes = parsed;
        }
      } catch {}

      newScenarios.push({
        id: row.id,
        name: row.name,
        triggers,
        triggerLogic: row.trigger_logic || 'ANY',
        conditionsJson: row.conditions_json || null,
        actions,
        priorityLevel: row.priority_level || 3,
        enabledHouseModes: enabledModes,
        cooldown_ms: row.cooldown_ms || DEFAULT_COOLDOWN_MS,
        debounce_ms: row.debounce_ms || 0,
        last_fired: existing?.last_fired || 0,
        run_mode: row.run_mode || 'single',
        timeout_sec: row.timeout_sec || 0,
      });

      // Build trigger index
      for (const trig of triggers) {
        const literalKey = `${trig.device}:${trig.property}`;
        addToIndex(newIndex, literalKey, row.id);

        if (!allDeviceIeees.has(trig.device)) {
          const ieees = devicesByType.get(trig.device) || [];
          for (const ieee of ieees) {
            addToIndex(newIndex, `${ieee}:${trig.property}`, row.id);
          }
        }
      }
    }

    scenarios = newScenarios;
    triggerIndex = newIndex;
    logger.log("[ENGINE] ", `🎭 Scenarios loaded: ${scenarios.length} active`);
    // Periodic cleanup of expired overrides
    cleanExpiredOverrides().catch(() => {});
  } catch (e: any) {
    logErrorWithLog(null, 'scenario_reload_error', e.message);
  }
}

function addToIndex(index: Map<string, number[]>, key: string, scenarioId: number): void {
  const ids = index.get(key) || [];
  if (!ids.includes(scenarioId)) ids.push(scenarioId);
  index.set(key, ids);
}

// ── Telemetry Evaluation ─────────────────────────────────

export async function evaluateTelemetry(
  deviceIeee: string,
  properties: Record<string, number>
): Promise<void> {
  if (scenarios.length === 0) return;

  const scenarioIds = new Set<number>();

  for (const prop of Object.keys(properties)) {
    const key = `${deviceIeee}:${prop}`;
    const ids = triggerIndex.get(key) || [];
    ids.forEach(id => scenarioIds.add(id));
    const wildKey = `*:${prop}`;
    const wildIds = triggerIndex.get(wildKey) || [];
    wildIds.forEach(id => scenarioIds.add(id));
  }

  if (scenarioIds.size === 0) return;

  // Build full telemetry map
  const telemetryMap = new Map<string, number>();
  telemetryMap.set(`${deviceIeee}:current`, 1);

  for (const [prop, value] of Object.entries(properties)) {
    telemetryMap.set(`${deviceIeee}:${prop}`, value);
  }

  // Add type aliases
  try {
    const deviceRow = (await query(`SELECT type FROM devices WHERE ieee_addr = ?`, deviceIeee))[0] as { type?: string } | undefined;
    if (deviceRow?.type) {
      for (const [prop, value] of Object.entries(properties)) {
        telemetryMap.set(`${deviceRow.type}:${prop}`, value);
      }
    }
  } catch {}

  const now = Date.now();

  for (const scenario of scenarios) {
    if (!scenarioIds.has(scenario.id)) continue;

    await enrichTelemetryMap(telemetryMap, scenario.triggers);

    // Evaluate triggers
    const matchedConditions: TriggerCondition[] = [];
    for (const trig of scenario.triggers) {
      if (evaluateTrigger(trig, telemetryMap)) {
        matchedConditions.push(trig);
      }
    }

    let triggered = false;
    if (scenario.triggerLogic === 'ALL') {
      triggered = matchedConditions.length === scenario.triggers.length;
    } else {
      triggered = matchedConditions.length > 0;
    }

    if (!triggered) continue;

    // Debounce check — Шаг 2b pipeline (design-doc раздел 5.1/4.1)
    // Если debounce_ms > 0, регистрируем в DebounceManager и прерываем синхронный вызов
    if (scenario.debounce_ms > 0) {
      const matchedTrigger = matchedConditions[0];
      if (matchedTrigger) {
        const trigKey = `${matchedTrigger.device}:${matchedTrigger.property}`;
        const goToDebounce = matchedConditions.some((mc: any) => {
          const k = `${mc.device}:${mc.property}`;
          return k === trigKey;
        });
        if (goToDebounce) {
          const shouldProceed = debounceManager.onTelemetry(
            deviceIeee,
            trigKey,
            0, // value будет проверено в колбэке
            scenario.id,
            trigKey,
            scenario.debounce_ms,
            async (scenarioId, triggerKey) => {
              // Debounce подтверждён — перепроверяем текущее значение
              try {
                const currentRow = await query(
                  `SELECT value FROM telemetry WHERE device_ieee = ? AND property = ?
                   ORDER BY ts DESC LIMIT 1`,
                  deviceIeee, trigKey
                );
                if (currentRow.length > 0) {
                  const currentVal = currentRow[0].value;
                  const stillMatches = matchedConditions.some((mc: any) => {
                    const mcKey = `${mc.device}:${mc.property}`;
                    if (mcKey !== triggerKey) return false;
                    return evaluateDeviceState(mc.device, mc.property, mc.operator, mc.value,
                      new Map([[triggerKey, currentVal]]));
                  });
                  if (!stillMatches) return; // Уже не удовлетворяет — ничего не делаем
                }
                // Duration пересчитывается заново (design-doc 5.3, 5.4)
                // Выполняем сценарий: загружаем actions и запускаем
                try {
                  const sRow = await query('SELECT * FROM scenarios WHERE id = ?', scenarioId);
                  if (sRow.length > 0) {
                    const acts = parseActions(sRow[0].actions_json);
                    if (acts) {
                      const execResult = await executeActions(acts, sRow[0].name, sRow[0].timeout_sec || 0);
                      logScenarioExec(scenarioId, 'debounce', execResult.fired,
                        execResult.errors.length === 0,
                        execResult.errors.length > 0 ? execResult.errors.join('; ') : undefined);
                    }
                  }
                } catch {} 
              } catch {}
            }
          );
          if (!shouldProceed) continue; // Debounce активен — ждём колбэк
        }
      }
    }

    // Evaluate conditions (guard) — Шаг 5 pipeline
    if (!evaluateConditions(scenario.conditionsJson, telemetryMap, currentHouseMode)) continue;

    // Check house mode (except priority 1) — Шаг 6 pipeline
    if (scenario.priorityLevel > 1) {
      if (!scenario.enabledHouseModes.includes(currentHouseMode)) continue;
    }

    // Cooldown check — Шаг 7 pipeline
    if (now - scenario.last_fired < scenario.cooldown_ms) continue;

    logger.log("[ENGINE] ", `🎯 [scenario #${scenario.id}] ${scenario.name} TRIGGERED`);

    // Check manual_override for each device in actions (шаг 8 pipeline)
    const overrideCheck = async (actions: ScenarioAction[]): Promise<boolean> => {
      for (const act of actions) {
        if (act.type === 'device_command' && act.device) {
          try {
            const override = await query(
              `SELECT id FROM manual_overrides WHERE device_ieee = ? AND expires_at > datetime('now') LIMIT 1`,
              act.device
            );
            if ((override as any[]).length > 0) {
              // Override существует — проверяем priority
              if (scenario.priorityLevel <= 2) continue; // bypass
              // SKIP это действие
              logger.log("[ENGINE] ", `⏭️ [scenario #${scenario.id}] device ${act.device} skipped (manual_override, priority=${scenario.priorityLevel})`);
              return false;
            }
          } catch {}
        }
      }
      return true;
    };

    if (!(await overrideCheck(scenario.actions))) {
      // Если все действия переопределены — пропускаем сценарий целиком
      const hadActions = scenario.actions.length > 0;
      if (hadActions) continue;
    }

    // Execute actions (with run_mode support)
    executeWithRunMode(scenario, async () => {
      const execResult = await executeActions(scenario.actions, scenario.name, scenario.timeout_sec || 0);

      logScenarioExec(
        scenario.id,
        JSON.stringify(matchedConditions.slice(0, 5)),
        execResult.fired,
        execResult.errors.length === 0,
        execResult.errors.length > 0 ? execResult.errors.join('; ') : undefined
      );

      scenario.last_fired = Date.now();
    });

    // Timer triggers (run after the scenario actions kick-off, not blocked by run_mode)
    const nowTimer = Date.now();

    // Check for timer triggers in this scenario
    // Если есть триггеры типа "timer" с after_event, ссылающимся на сработавший триггер
    for (const trig of scenario.triggers) {
      if (trig.type === 'timer' && trig.after_event && trig.duration_ms) {
        // Check if any matched trigger has this id
        const matched = matchedConditions.some(mc => mc.id === trig.after_event);
        if (matched) {
          timerManager.register(scenario.id, trig.after_event, trig.duration_ms);
        }
      }
    }
  }
}

// ── Telemetry Enrichment ─────────────────────────────────

async function enrichTelemetryMap(
  map: Map<string, number>,
  triggers: TriggerCondition[]
): Promise<void> {
  const needed = new Set<string>();

  for (const trig of triggers) {
    const key = `${trig.device}:${trig.property}`;
    if (!map.has(key)) {
      needed.add(key);
    }
  }

  if (needed.size === 0) return;

  await Promise.all(
    Array.from(needed).map(async (key) => {
      const [device, property] = key.split(':');
      try {
        const literal = await query(
          `SELECT value FROM telemetry
           WHERE device_ieee = ? AND property = ?
           ORDER BY ts DESC LIMIT 1`,
          device, property
        );
        if (literal.length > 0) {
          map.set(key, literal[0].value);
          return;
        }
        const byType = await query(
          `SELECT t.value FROM telemetry t
           JOIN devices d ON d.ieee_addr = t.device_ieee
           WHERE d.type = ? AND t.property = ?
           ORDER BY t.ts DESC LIMIT 1`,
          device, property
        );
        if (byType.length > 0) {
          map.set(key, byType[0].value);
        }
      } catch {
        // Device or property not found — leave as undefined
      }
    })
  );
}

// ── Push-notifications ──────────────────────────────────────

export async function sendPushNotification(title: string, body: string, icon = '/icons/icon-192.png') {
  try {
    const subscriptions = await query('SELECT * FROM push_subscriptions') as any[];
    if (!subscriptions.length) return;

    const payload = JSON.stringify({ title, body, icon });

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, payload);
      } catch (e: any) {
        if (e.statusCode === 410) {
          await query('DELETE FROM push_subscriptions WHERE endpoint = ?', sub.endpoint);
        } else {
          logger.warn('[PUSH] Не удалось отправить уведомление:', e.message);
        }
      }
    }
  } catch (e: any) {
    logger.error('[PUSH] Ошибка при отправке:', e.message);
  }
}

// ── Force Reload ─────────────────────────────────────────

reloadScenarios().catch(e => logger.error("[ENGINE] ", 'Initial scenario load failed:', e.message));

// ── Timer Trigger Handler ─────────────────────────────────
// Вызывается из TimerManager при срабатывании timer trigger

export async function evaluateTimerTrigger(scenarioId: number, triggerId: string): Promise<void> {
  try {
    const rows = await query('SELECT * FROM scenarios WHERE id = ? AND active = true', scenarioId);
    if (!rows.length) return;
    const scenario = rows[0];
    const actions = parseActions(scenario.actions_json);
    if (!actions) return;

    logger.log("[ENGINE] ", `⏰ [scenario #${scenarioId}] ${scenario.name} — timer trigger fired (${triggerId})`);

    // Check conditions (guard)
    const telemetryMap = new Map<string, number>();
    if (!evaluateConditions(scenario.conditions_json || null, telemetryMap, currentHouseMode)) {
      logger.log("[ENGINE] ", `⏰ [scenario #${scenarioId}] timer trigger skipped — conditions not met`);
      return;
    }

    const execResult = await executeActions(actions, scenario.name, scenario.timeout_sec || 0);
    logScenarioExec(scenarioId, `timer:${triggerId}`,
      execResult.fired,
      execResult.errors.length === 0,
      execResult.errors.length > 0 ? execResult.errors.join('; ') : undefined
    );
  } catch (e: any) {
    logErrorWithLog(null, 'timer_trigger_error', e.message, `scenario #${scenarioId}`);
  }
}

// ── Execute Scenario By Name ──────────────────────────────
// Используется из call_scenario action

export async function executeScenarioByName(name: string): Promise<boolean> {
  try {
    const rows = await query('SELECT * FROM scenarios WHERE name = ? AND active = true LIMIT 1', name);
    if (!rows.length) {
      logger.warn("[ENGINE] ", `⚠️ executeScenarioByName: scenario "${name}" not found or inactive`);
      return false;
    }
    const scenario = rows[0];
    const actions = parseActions(scenario.actions_json);
    if (!actions) {
      logger.warn("[ENGINE] ", `⚠️ executeScenarioByName: scenario "${name}" has no valid actions`);
      return false;
    }
    const execResult = await executeActions(actions, scenario.name, scenario.timeout_sec || 0);
    logScenarioExec(scenario.id, 'call_scenario',
      execResult.fired,
      execResult.errors.length === 0,
      execResult.errors.length > 0 ? execResult.errors.join('; ') : undefined
    );
    return execResult.errors.length === 0;
  } catch (e: any) {
    logErrorWithLog(null, 'call_scenario_error', e.message, `scenario:${name}`);
    return false;
  }
}
