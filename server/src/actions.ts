import { query, logError, logCommand, logStateChange } from './db';

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
      console.warn(`⚠️ Unknown action type: ${(action as any).type}`);
      return false;
  }
}

function executeMqttAction(action: ScenarioAction, scenarioName: string): boolean {
  if (!action.device || !action.command) {
    logError(null, 'scenario_action_error', 'Missing device or command', scenarioName);
    return false;
  }

  // Log command in DB — actual MQTT publish is done via publishCommand()
  const cmdId = logCommand(action.device, action.command, JSON.stringify(action.payload || {}), 'scenario');
  logStateChange(action.device, '?', action.command, `scenario:${scenarioName}`);

  // Complete command immediately (MQTT publish will happen via publishCommand in mqtt-ws)
  query(
    `UPDATE commands SET status = 'success', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    cmdId
  ).catch(() => {});

  console.log(`🎬 [${scenarioName}] → ${action.device}: ${action.command}`);
  return true;
}

function executeNotifyAction(action: ScenarioAction, scenarioName: string): boolean {
  if (!action.message) {
    logError(null, 'scenario_action_error', 'Missing message', scenarioName);
    return false;
  }

  // Log as a system notification in the state_changes table
  query(
    `INSERT INTO state_changes (id, device_ieee, old_state, new_state, reason) 
     VALUES (nextval('state_changes_seq'), 'system', 'idle', 'notify', ?)`,
    `scenario:${scenarioName}: ${action.message}`
  ).catch(() => {});

  console.log(`🔔 [${scenarioName}] NOTIFY: ${action.message}`);
  return true;
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
      logError(null, 'scenario_action_error', e.message, scenarioName);
    }
  }

  return { fired, success, errors };
}

// ── Parse Helpers ────────────────────────────────────────

export function parseActions(json: string): ScenarioAction[] | null {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    // Validate each action has a type
    for (const a of parsed) {
      if (!a.type || !['mqtt', 'notify'].includes(a.type)) return null;
    }
    return parsed as ScenarioAction[];
  } catch {
    return null;
  }
}
