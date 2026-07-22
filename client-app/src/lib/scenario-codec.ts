import type { Condition, DeviceCondition, TimeCondition, StateCondition, Action, DeviceAction, GroupAction, DelayAction, ScenarioAction } from '../types/scenario-builder';
import { PROP_LABELS } from '../types/scenario-builder';

// ── Build trigger JSON from conditions ─────────────

export function buildTriggers(conditions: Condition[], logic: 'ANY' | 'ALL'): string {
  if (!conditions.length) return '[]';

  const triggerConditions = conditions.map(c => {
    switch (c.type) {
      case 'device':
        return { type: 'device', device: c.device, property: c.property, operator: c.operator, value: c.value };
      case 'time':
        return { type: 'schedule', kind: c.kind, offset_minutes: c.offsetMinutes, time: c.timeStr, cron: c.cronExpr };
      case 'state':
        return { type: 'device', device: c.device, property: 'state', operator: '=', value: c.expectedState === 'open' || c.expectedState === 'on' ? 1 : 0 };
    }
  });

  // Include logic as a separate parameter (used by server for evaluation)
  return JSON.stringify({ logic, conditions: triggerConditions });
}

// ── Build actions JSON from actions ─────────────────

export function buildActions(actions: Action[]): string {
  if (!actions.length) return '[]';

  const actionList = actions.map(a => {
    switch (a.type) {
      case 'device':
        return { type: 'device_command', device: a.device, command: a.command, payload: a.brightness != null ? { brightness: a.brightness } : {} };
      case 'group':
        return { type: 'group_command', room_id: a.roomId, device_type: a.deviceType, command: a.command };
      case 'delay':
        return { type: 'delay', seconds: a.seconds };
      case 'scenario':
        return { type: 'scenario_toggle', scenario_id: a.scenarioId, enable: a.enable };
    }
  });

  return JSON.stringify(actionList);
}

// ── Parse trigger JSON → { conditions, logic } ──────

export function parseTriggers(json: string): { conditions: Condition[]; logic: 'ANY' | 'ALL' } {
  try {
    const parsed = JSON.parse(json);
    // NEW format: array of trigger objects (each has type: 'device' | 'schedule')
    if (Array.isArray(parsed)) {
      const conditions: Condition[] = parsed.map((c: any): Condition => {
        if (c.type === 'schedule') {
          return { type: 'time', kind: c.kind || 'time', offsetMinutes: c.offset_minutes, timeStr: c.time, cronExpr: c.cron };
        }
        if (c.property === 'state') {
          const expected = c.value === 1 ? 'open' : 'closed';
          return { type: 'state', device: c.device || '', expectedState: expected };
        }
        return { type: 'device', device: c.device || '', property: c.property || 'temperature', operator: c.operator || '>', value: c.value ?? 0 };
      });
      return { conditions, logic: 'ANY' };
    }
    // OLD format: { logic, conditions: [...] }
    if (!parsed || !Array.isArray(parsed.conditions)) return { conditions: [], logic: 'ANY' };
    const conditions: Condition[] = parsed.conditions.map((c: any): Condition => {
      if (c.type === 'schedule') {
        return { type: 'time', kind: c.kind || 'time', offsetMinutes: c.offset_minutes, timeStr: c.time, cronExpr: c.cron };
      }
      // State condition: property === 'state'
      if (c.property === 'state') {
        const expected = c.value === 1 ? 'open' : 'closed';
        return { type: 'state', device: c.device || '', expectedState: expected };
      }
      return { type: 'device', device: c.device || '', property: c.property || 'temperature', operator: c.operator || '>', value: c.value ?? 0 };
    });
    return { conditions, logic: parsed.logic === 'ALL' ? 'ALL' : 'ANY' };
  } catch { return { conditions: [], logic: 'ANY' }; }
}

// ── Parse actions JSON → Actions ────────────────────

export function parseActions(json: string): Action[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((a: any): Action => {
      switch (a.type) {
        case 'group':
        case 'group_command':
          return { type: 'group', roomId: a.room_id || '', deviceType: a.device_type || 'light', command: a.command || 'ON' };
        case 'delay':
          return { type: 'delay', seconds: a.seconds || 60 };
        case 'scenario_toggle':
          return { type: 'scenario', scenarioId: String(a.scenario_id || ''), enable: a.enable !== false };
        case 'device_command':
        case 'mqtt':
        default:
          return { type: 'device', device: a.device || '', command: a.command || 'ON', brightness: a.payload?.brightness };
      }
    });
  } catch { return []; }
}

// ── Human-readable preview ──────────────────────────

export function describeCondition(c: Condition, devices: { id: string; name: string }[]): string {
  const devName = 'device' in c ? (devices.find(d => d.id === c.device)?.name || c.device) : '';
  const propLabel = 'property' in c ? PROP_LABELS[c.property] || c.property : '';

  switch (c.type) {
    case 'device': return `${devName}: ${propLabel} ${c.operator} ${c.value}`;
    case 'time': return `${c.kind === 'sunset' ? 'Закат' : c.kind === 'sunrise' ? 'Рассвет' : c.kind === 'cron' ? c.cronExpr : c.timeStr}${c.offsetMinutes ? ` ${c.offsetMinutes > 0 ? '+' : ''}${c.offsetMinutes} мин` : ''}`;
    case 'state': return `${devName} = ${c.expectedState}`;
    default: return '?';
  }
}

export function describeAction(a: Action, devices: { id: string; name: string }[], rooms: { id: string; name: string }[]): string {
  const devName = 'device' in a ? (devices.find(d => d.id === a.device)?.name || a.device) : '';
  switch (a.type) {
    case 'device': return `${devName}: ${a.command}${a.brightness != null ? ` ${a.brightness}%` : ''}`;
    case 'group': {
      const roomName = rooms.find(r => r.id === a.roomId)?.name || '?';
      return `Все ${a.deviceType} в ${roomName}: ${a.command}`;
    }
    case 'delay': return `Пауза ${a.seconds} сек`;
    case 'scenario': return `Сценарий #${a.scenarioId}: ${a.enable ? 'ВКЛ' : 'ВЫКЛ'}`;
    default: return '?';
  }
}
