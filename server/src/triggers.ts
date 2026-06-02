// Trigger condition types
export interface TriggerCondition {
  device: string;
  property: string;
  operator: '>' | '<' | '>=' | '<=' | '=' | '!=';
  value: number;
}

export interface TriggerSet {
  logic: 'ANY' | 'ALL';
  conditions: TriggerCondition[];
}

// ── Condition Evaluator ──────────────────────────────────

export function evaluateCondition(condition: TriggerCondition, currentValue: number): boolean {
  const { operator, value } = condition;
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

// ── Trigger Set Evaluator ────────────────────────────────

/**
 * Evaluate a set of triggers against a map of { device_property: current_value }.
 * ANY logic: at least one condition must match.
 * ALL logic: all conditions must match (checked individually).
 */
export function evaluateTriggers(
  triggers: TriggerSet,
  telemetryMap: Map<string, number>
): { matched: boolean; matchedConditions: TriggerCondition[] } {
  const matchedConditions: TriggerCondition[] = [];

  for (const cond of triggers.conditions) {
    const key = `${cond.device}:${cond.property}`;
    const currentValue = telemetryMap.get(key);

    if (currentValue !== undefined && evaluateCondition(cond, currentValue)) {
      matchedConditions.push(cond);
    }
  }

  if (triggers.logic === 'ALL') {
    // ALL: every condition must evaluate to true individually
    const allMatched = triggers.conditions.every(cond => {
      const key = `${cond.device}:${cond.property}`;
      const cv = telemetryMap.get(key);
      return cv !== undefined && evaluateCondition(cond, cv);
    });
    return { matched: allMatched, matchedConditions };
  }

  // ANY: at least one condition matches
  return { matched: matchedConditions.length > 0, matchedConditions };
}

// ── Trigger Index Builder ────────────────────────────────

/**
 * Build a lookup index for fast scenario matching.
 * Returns: Map<"device:property", scenario_ids[]>
 */
export function buildTriggerIndex(
  scenarios: Array<{ id: number; triggers_json: string }>
): Map<string, number[]> {
  const index = new Map<string, number[]>();

  for (const s of scenarios) {
    try {
      const triggers: TriggerSet = JSON.parse(s.triggers_json);
      for (const cond of triggers.conditions) {
        const key = `${cond.device}:${cond.property}`;
        const ids = index.get(key) || [];
        if (!ids.includes(s.id)) {
          ids.push(s.id);
        }
        index.set(key, ids);
      }
    } catch {
      // Skip invalid triggers_json
    }
  }

  return index;
}

// ── Parse Helpers ────────────────────────────────────────

export function parseTriggers(json: string): TriggerSet | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.conditions || !Array.isArray(parsed.conditions)) return null;
    if (!['ANY', 'ALL'].includes(parsed.logic)) return null;
    return parsed as TriggerSet;
  } catch {
    return null;
  }
}
