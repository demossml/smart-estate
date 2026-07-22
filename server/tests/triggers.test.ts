import { describe, it, expect } from 'vitest';
import { evaluateCondition, evaluateTriggers, parseTriggers, buildTriggerIndex } from '../src/triggers';

describe('evaluateCondition', () => {
  it('> operator', () => {
    expect(evaluateCondition({ device: 'x', property: 't', operator: '>', value: 1000 }, 1500)).toBe(true);
    expect(evaluateCondition({ device: 'x', property: 't', operator: '>', value: 1000 }, 500)).toBe(false);
    expect(evaluateCondition({ device: 'x', property: 't', operator: '>', value: 1000 }, 1000)).toBe(false);
  });

  it('< operator', () => {
    expect(evaluateCondition({ device: 'x', property: 't', operator: '<', value: 50 }, 30)).toBe(true);
    expect(evaluateCondition({ device: 'x', property: 't', operator: '<', value: 50 }, 70)).toBe(false);
  });

  it('>= operator', () => {
    expect(evaluateCondition({ device: 'x', property: 't', operator: '>=', value: 22 }, 22)).toBe(true);
    expect(evaluateCondition({ device: 'x', property: 't', operator: '>=', value: 22 }, 23)).toBe(true);
    expect(evaluateCondition({ device: 'x', property: 't', operator: '>=', value: 22 }, 20)).toBe(false);
  });

  it('<= operator', () => {
    expect(evaluateCondition({ device: 'x', property: 't', operator: '<=', value: 18 }, 18)).toBe(true);
    expect(evaluateCondition({ device: 'x', property: 't', operator: '<=', value: 18 }, 17)).toBe(true);
    expect(evaluateCondition({ device: 'x', property: 't', operator: '<=', value: 18 }, 20)).toBe(false);
  });

  it('= operator', () => {
    expect(evaluateCondition({ device: 'x', property: 't', operator: '=', value: 1 }, 1)).toBe(true);
    expect(evaluateCondition({ device: 'x', property: 't', operator: '=', value: 1 }, 0)).toBe(false);
  });

  it('!= operator', () => {
    expect(evaluateCondition({ device: 'x', property: 't', operator: '!=', value: 0 }, 1)).toBe(true);
    expect(evaluateCondition({ device: 'x', property: 't', operator: '!=', value: 0 }, 0)).toBe(false);
  });
});

describe('evaluateTriggers', () => {
  it('ANY logic — matches when any condition is true', () => {
    const map = new Map([['sensor1:co2', 1200], ['sensor1:temp', 25]]);
    const triggers = {
      logic: 'ANY' as const,
      conditions: [
        { device: 'sensor1', property: 'co2', operator: '>' as const, value: 1000 },
        { device: 'sensor1', property: 'humidity', operator: '<' as const, value: 30 },
      ],
    };
    const result = evaluateTriggers(triggers, map);
    expect(result.matched).toBe(true);
    expect(result.matchedConditions.length).toBe(1);
    expect(result.matchedConditions[0].property).toBe('co2');
  });

  it('ANY logic — does not match when no condition is true', () => {
    const map = new Map([['sensor1:co2', 800]]);
    const triggers = {
      logic: 'ANY' as const,
      conditions: [
        { device: 'sensor1', property: 'co2', operator: '>' as const, value: 1000 },
      ],
    };
    expect(evaluateTriggers(triggers, map).matched).toBe(false);
  });

  it('ALL logic — matches when all conditions are true', () => {
    const map = new Map([
      ['climate:temperature', 23],
      ['climate:humidity', 50],
    ]);
    const triggers = {
      logic: 'ALL' as const,
      conditions: [
        { device: 'climate', property: 'temperature', operator: '>' as const, value: 22 },
        { device: 'climate', property: 'temperature', operator: '<' as const, value: 24 },
        { device: 'climate', property: 'humidity', operator: '>' as const, value: 40 },
        { device: 'climate', property: 'humidity', operator: '<' as const, value: 60 },
      ],
    };
    const result = evaluateTriggers(triggers, map);
    expect(result.matched).toBe(true);
    expect(result.matchedConditions.length).toBe(4);
  });

  it('ALL logic — fails if any condition is false', () => {
    const map = new Map([['climate:temperature', 26]]);
    const triggers = {
      logic: 'ALL' as const,
      conditions: [
        { device: 'climate', property: 'temperature', operator: '>' as const, value: 22 },
        { device: 'climate', property: 'temperature', operator: '<' as const, value: 24 },
      ],
    };
    expect(evaluateTriggers(triggers, map).matched).toBe(false);
  });

  it('handles missing telemetry gracefully', () => {
    const map = new Map<string, number>();
    const triggers = {
      logic: 'ANY' as const,
      conditions: [
        { device: 'ghost', property: 'co2', operator: '>' as const, value: 1000 },
      ],
    };
    expect(evaluateTriggers(triggers, map).matched).toBe(false);
  });

  it('matches with zero values correctly', () => {
    const map = new Map([['sensor:power', 0]]);
    const triggers = {
      logic: 'ANY' as const,
      conditions: [
        { device: 'sensor', property: 'power', operator: '=' as const, value: 0 },
      ],
    };
    expect(evaluateTriggers(triggers, map).matched).toBe(true);
  });
});

describe('parseTriggers', () => {
  it('parses valid triggers JSON', () => {
    const json = JSON.stringify({
      logic: 'ANY',
      conditions: [{ device: 's1', property: 't', operator: '>', value: 100 }],
    });
    const result = parseTriggers(json);
    expect(result).not.toBeNull();
    expect(result!.logic).toBe('ANY');
    expect(result!.conditions.length).toBe(1);
  });

  it('rejects invalid JSON', () => {
    expect(parseTriggers('not json')).toBeNull();
  });

  it('rejects missing conditions array', () => {
    expect(parseTriggers('{"logic":"ANY"}')).toBeNull();
  });

  it('rejects invalid logic type', () => {
    expect(parseTriggers('{"logic":"XOR","conditions":[]}')).toBeNull();
  });
});

describe('buildTriggerIndex', () => {
  it('builds index from scenarios', () => {
    const scenarios = [
      {
        id: 1,
        triggers_json: JSON.stringify({
          logic: 'ANY',
          conditions: [
            { device: 's1', property: 'co2', operator: '>', value: 1000 },
            { device: 's2', property: 'temp', operator: '<', value: 18 },
          ],
        }),
      },
      {
        id: 2,
        triggers_json: JSON.stringify({
          logic: 'ANY',
          conditions: [
            { device: 's1', property: 'co2', operator: '<', value: 400 },
          ],
        }),
      },
    ];

    const index = buildTriggerIndex(scenarios);
    expect(index.get('s1:co2')).toEqual([1, 2]);
    expect(index.get('s2:temp')).toEqual([1]);
  });

  it('skips invalid scenarios', () => {
    const scenarios = [
      { id: 1, triggers_json: 'invalid' },
      { id: 2, triggers_json: JSON.stringify({ logic: 'ANY', conditions: [{ device: 's1', property: 't', operator: '>', value: 10 }] }) },
    ];
    const index = buildTriggerIndex(scenarios);
    expect(index.get('s1:t')).toEqual([2]);
  });
});
