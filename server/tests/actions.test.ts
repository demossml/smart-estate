import { describe, it, expect } from 'vitest';
import { executeAction, executeActions, parseActions, ScenarioAction } from '../src/actions';

describe('parseActions', () => {
  it('parses valid actions JSON', () => {
    const json = JSON.stringify([
      { type: 'mqtt', device: 'valve', command: 'ON' },
      { type: 'notify', message: 'Test notification' },
    ]);
    const result = parseActions(json);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    expect(result![0].type).toBe('mqtt');
    expect(result![1].type).toBe('notify');
  });

  it('rejects invalid JSON', () => {
    expect(parseActions('not json')).toBeNull();
  });

  it('rejects non-array', () => {
    expect(parseActions('{"type":"mqtt"}')).toBeNull();
  });

  it('rejects actions without type', () => {
    expect(parseActions('[{"device":"test"}]')).toBeNull();
  });

  it('rejects unknown action type', () => {
    expect(parseActions('[{"type":"unknown"}]')).toBeNull();
  });
});

describe('executeAction', () => {
  it('executes notify action successfully', async () => {
    const action: ScenarioAction = { type: 'notify', message: 'Test notification' };
    const result = await executeAction(action, 'Test Scenario');
    expect(result).toBe(true);
  });

  it('fails notify without message', async () => {
    const action: ScenarioAction = { type: 'notify', message: '' };
    const result = await executeAction(action, 'Test');
    expect(result).toBe(false);
  });

  it('fails mqtt without device', async () => {
    const action: ScenarioAction = { type: 'mqtt', command: 'ON' };
    const result = await executeAction(action, 'Test');
    expect(result).toBe(false);
  });

  it('fails mqtt without command', async () => {
    const action: ScenarioAction = { type: 'mqtt', device: 'dev1' };
    const result = await executeAction(action, 'Test');
    expect(result).toBe(false);
  });
});

describe('executeActions', () => {
  it('returns fired count and success count', async () => {
    const actions: ScenarioAction[] = [
      { type: 'notify', message: 'Action 1' },
      { type: 'notify', message: 'Action 2' },
    ];
    const result = await executeActions(actions, 'Batch Test');
    expect(result.fired).toBe(2);
    expect(result.success).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  it('tracks errors from failed actions', async () => {
    const actions: ScenarioAction[] = [
      { type: 'notify', message: 'OK' },
      { type: 'mqtt', command: 'ON' }, // missing device → fails
    ];
    const result = await executeActions(actions, 'Mixed Test');
    expect(result.fired).toBe(2);
    expect(result.success).toBe(1);
    expect(result.errors.length).toBe(1);
  });
});
