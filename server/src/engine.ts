import { query, logErrorWithLog, logScenarioExec } from './db';
import { evaluateTriggers, parseTriggers, TriggerSet, TriggerCondition } from './triggers';
import { executeActions, parseActions, ScenarioAction } from './actions';
import logger from './logger';

// ── Scenario Engine ──────────────────────────────────────

interface LoadedScenario {
  id: number;
  name: string;
  triggers: TriggerSet;
  actions: ScenarioAction[];
  cooldown_ms: number;
  last_fired: number; // timestamp
}

// Cooldown: minimum interval between scenario fires (default 60s)
const DEFAULT_COOLDOWN_MS = 60_000;

// Cache of loaded scenarios
let scenarios: LoadedScenario[] = [];
// Trigger index: "device_or_type:property" → [scenario_ids]
let triggerIndex: Map<string, number[]> = new Map();

const IEEE_RE = /^0x[0-9a-f]{16}$/i; // оставлен только для читаемости логов, не для решений

// ── Engine Lifecycle ─────────────────────────────────────

export async function reloadScenarios(): Promise<void> {
  try {
    const rows = await query(`SELECT * FROM scenarios WHERE active = true ORDER BY id`);
    const newScenarios: LoadedScenario[] = [];
    const newIndex = new Map<string, number[]>();

    // НАХОДКА (аудит движка автоматизации): условия сценариев ссылаются на
    // "device" полем, которое может быть либо реальным ieee-адресом
    // (0x + 16 hex), либо, как в дефолтных сценариях, ЗАГЛУШКОЙ-ТИПОМ
    // (например "air_monitor", "door_sensor"). Раньше индекс строился и
    // проверялся ТОЛЬКО по буквальному значению этого поля — телеметрия
    // приходит с реальным ieee, поэтому такие условия никогда не совпадали.
    // Резолвим тип → все устройства этого типа, и индексируем условие
    // дополнительно под их реальными ieee.
    // НАХОДКА (при чтении Модуля 5, demo.ts): раньше здесь проверялось
    // IEEE_RE.test(cond.device) — регекс, ожидающий формат "0x"+16 hex.
    // Но демо-устройства используют идентификаторы вида "demo:kitchen_air"
    // (тоже реальные значения devices.ieee_addr, просто другого формата!) —
    // регекс их не узнавал и ошибочно принимал за тип-заглушку. Теперь вместо
    // угадывания формата проверяем по факту: существует ли такой ieee_addr
    // в devices. Это работает одинаково для реальных Zigbee-адресов,
    // демо-идентификаторов и любого будущего формата адресации.
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
      newScenarios.push({
        id: row.id,
        name: row.name,
        triggers,
        actions,
        cooldown_ms: DEFAULT_COOLDOWN_MS,
        last_fired: existing?.last_fired || 0,
      });

      // Build index entry — под буквальным ключом (для обратной совместимости
      // и для enrichTelemetryMap) и, если device — это тип, ещё и под каждым
      // реальным ieee устройства этого типа.
      for (const cond of triggers.conditions) {
        const literalKey = `${cond.device}:${cond.property}`;
        addToIndex(newIndex, literalKey, row.id);

        if (!allDeviceIeees.has(cond.device)) {
          const ieees = devicesByType.get(cond.device) || [];
          for (const ieee of ieees) {
            addToIndex(newIndex, `${ieee}:${cond.property}`, row.id);
          }
        }
      }
    }

    scenarios = newScenarios;
    triggerIndex = newIndex;
    logger.log("[ENGINE] ", `🎭 Scenarios loaded: ${scenarios.length} active`);
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

/**
 * Called from MQTT handler after telemetry is stored.
 * Evaluates all relevant scenarios against the incoming data.
 */
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

  // Build full telemetry map for evaluation
  const telemetryMap = new Map<string, number>();
  telemetryMap.set(`${deviceIeee}:current`, 1);

  for (const [prop, value] of Object.entries(properties)) {
    telemetryMap.set(`${deviceIeee}:${prop}`, value);
  }

  // НАХОДКА: evaluateTriggers (в triggers.ts) строит ключ поиска из буквального
  // cond.device — если условие сценария написано как "air_monitor:co2", а не
  // как реальный ieee, telemetryMap должен содержать значение ПОД ЭТИМ ЖЕ
  // буквальным ключом, иначе even после фикса индекса (выше) сам evaluateTriggers
  // не найдёт значение. Поэтому дублируем значение под алиасом "тип:свойство",
  // если у сработавшего устройства есть type.
  try {
    const deviceRow = (await query(`SELECT type FROM devices WHERE ieee_addr = ?`, deviceIeee))[0] as { type?: string } | undefined;
    if (deviceRow?.type) {
      for (const [prop, value] of Object.entries(properties)) {
        telemetryMap.set(`${deviceRow.type}:${prop}`, value);
      }
    }
  } catch {
    // Если lookup не удался — просто не будет алиаса по типу для этого события,
    // не блокируем остальную оценку
  }

  const now = Date.now();

  for (const scenario of scenarios) {
    if (!scenarioIds.has(scenario.id)) continue;
    if (now - scenario.last_fired < scenario.cooldown_ms) continue;

    await enrichTelemetryMap(telemetryMap, scenario.triggers.conditions);

    const result = evaluateTriggers(scenario.triggers, telemetryMap);

    if (result.matched) {
      logger.log("[ENGINE] ", `🎯 [scenario #${scenario.id}] ${scenario.name} TRIGGERED`);

      const execResult = await executeActions(scenario.actions, scenario.name);

      logScenarioExec(
        scenario.id,
        JSON.stringify(result.matchedConditions.slice(0, 5)),
        execResult.fired,
        execResult.errors.length === 0,
        execResult.errors.length > 0 ? execResult.errors.join('; ') : undefined
      );

      scenario.last_fired = now;
    }
  }
}

// ── Telemetry Enrichment ─────────────────────────────────

/**
 * Fetch latest telemetry values for all devices referenced in conditions.
 * This ensures we have current values for cross-device scenarios.
 *
 * НАХОДКА: раньше делался прямой запрос `WHERE device_ieee = cond.device`,
 * что не находило ничего, если cond.device — это тип-заглушка, а не реальный
 * ieee. Теперь для нe-ieee значений ищем последнюю телеметрию среди ВСЕХ
 * устройств этого типа через JOIN с devices.
 */
async function enrichTelemetryMap(
  map: Map<string, number>,
  conditions: TriggerCondition[]
): Promise<void> {
  const needed = new Set<string>();

  for (const cond of conditions) {
    const key = `${cond.device}:${cond.property}`;
    if (!map.has(key)) {
      needed.add(key);
    }
  }

  if (needed.size === 0) return;

  await Promise.all(
    Array.from(needed).map(async (key) => {
      const [device, property] = key.split(':');
      try {
        // Сначала пробуем как буквальный идентификатор устройства (работает
        // и для реальных ieee, и для demo:xxx — не гадаем по формату строки).
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
        // Не нашли буквально — трактуем как тип устройства.
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

// ── Force Reload ─────────────────────────────────────────

// Auto-reload on module load
reloadScenarios().catch(e => logger.error("[ENGINE] ", 'Initial scenario load failed:', e.message));
