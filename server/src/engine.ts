import { query, logErrorWithLog, logScenarioExec } from './db';
import { evaluateTriggers, buildTriggerIndex, parseTriggers, TriggerSet, TriggerCondition } from './triggers';
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
// Trigger index: "device:property" → [scenario_ids]
let triggerIndex: Map<string, number[]> = new Map();

// ── Engine Lifecycle ─────────────────────────────────────

export async function reloadScenarios(): Promise<void> {
  try {
    const rows = await query(`SELECT * FROM scenarios WHERE active = true ORDER BY id`);
    const newScenarios: LoadedScenario[] = [];
    const newIndex = new Map<string, number[]>();

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

      // Build index entry
      for (const cond of triggers.conditions) {
        const key = `${cond.device}:${cond.property}`;
        const ids = newIndex.get(key) || [];
        ids.push(row.id);
        newIndex.set(key, ids);
      }
    }

    scenarios = newScenarios;
    triggerIndex = newIndex;
    logger.log("[ENGINE] ", `🎭 Scenarios loaded: ${scenarios.length} active`);
  } catch (e: any) {
    logErrorWithLog(null, 'scenario_reload_error', e.message);
  }
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

  // Build lookup key for this device
  const scenarioIds = new Set<number>();

  for (const prop of Object.keys(properties)) {
    const key = `${deviceIeee}:${prop}`;
    const ids = triggerIndex.get(key) || [];
    ids.forEach(id => scenarioIds.add(id));
    // Also check wildcard match (any device for a property)
    const wildKey = `*:${prop}`;
    const wildIds = triggerIndex.get(wildKey) || [];
    wildIds.forEach(id => scenarioIds.add(id));
  }

  if (scenarioIds.size === 0) return;

  // Build full telemetry map for evaluation
  // We need the latest value for ALL properties referenced by these scenarios
  const telemetryMap = new Map<string, number>();
  telemetryMap.set(`${deviceIeee}:current`, 1); // mark that this device has new data

  // Add incoming properties
  for (const [prop, value] of Object.entries(properties)) {
    telemetryMap.set(`${deviceIeee}:${prop}`, value);
  }

  // For each matching scenario, evaluate triggers
  const now = Date.now();

  for (const scenario of scenarios) {
    if (!scenarioIds.has(scenario.id)) continue;

    // Cooldown check
    if (now - scenario.last_fired < scenario.cooldown_ms) continue;

    // We have SOME matching property, but need ALL trigger conditions evaluated
    // Fetch latest telemetry for all devices referenced in this scenario
    await enrichTelemetryMap(telemetryMap, scenario.triggers.conditions);

    const result = evaluateTriggers(scenario.triggers, telemetryMap);

    if (result.matched) {
      logger.log("[ENGINE] ", `🎯 [scenario #${scenario.id}] ${scenario.name} TRIGGERED`);

      // Execute actions
      const execResult = await executeActions(scenario.actions, scenario.name);

      // Log execution
      logScenarioExec(
        scenario.id,
        JSON.stringify(result.matchedConditions.slice(0, 5)),
        execResult.fired,
        execResult.errors.length === 0,
        execResult.errors.length > 0 ? execResult.errors.join('; ') : undefined
      );

      // Update cooldown
      scenario.last_fired = now;
    }
  }
}

// ── Telemetry Enrichment ─────────────────────────────────

/**
 * Fetch latest telemetry values for all devices referenced in conditions.
 * This ensures we have current values for cross-device scenarios.
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

  // Fetch latest values in parallel
  await Promise.all(
    Array.from(needed).map(async (key) => {
      const [device, property] = key.split(':');
      try {
        const rows = await query(
          `SELECT value FROM telemetry 
           WHERE device_ieee = ? AND property = ? 
           ORDER BY ts DESC LIMIT 1`,
          device, property
        );
        if (rows.length > 0) {
          map.set(key, rows[0].value);
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
