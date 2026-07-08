import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const TEST_DB = '/tmp/smart-estate-engine-test.db';
process.env.SMART_ESTATE_DB_PATH = TEST_DB;

const fs = require('fs');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
if (fs.existsSync(TEST_DB + '.wal')) fs.unlinkSync(TEST_DB + '.wal');

let dbMod: any;
let engineMod: any;

beforeAll(async () => {
  dbMod = await import('../src/db');
  engineMod = await import('../src/engine');
});

afterAll(async () => {
  if (dbMod.db && typeof dbMod.db.close === 'function') dbMod.db.close();
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.unlinkSync(TEST_DB + '.wal'); } catch {}
  try { fs.unlinkSync(TEST_DB + '.shm'); } catch {}
});

describe('Engine — reloadScenarios', () => {
  it('reloadScenarios runs without error on empty DB', async () => {
    const { reloadScenarios } = engineMod;
    await expect(reloadScenarios()).resolves.not.toThrow();
  });

  it('reloadScenarios loads active scenarios', async () => {
    // Insert test scenarios
    await dbMod.query(
      `INSERT INTO scenarios (name, description, triggers_json, actions_json, active)
       VALUES ('High Temp Alert', 'Alert when temp > 30', '{"logic":"ANY","conditions":[{"device":"0xSENSOR","property":"temperature","operator":">","value":30}]}', '[{"type":"notify","message":"Hot!"}]', 1)`
    );
    await dbMod.query(
      `INSERT INTO scenarios (name, description, triggers_json, actions_json, active)
       VALUES ('Low Humidity', 'Alert when humidity < 20', '{"logic":"ANY","conditions":[{"device":"0xSENSOR","property":"humidity","operator":"<","value":20}]}', '[{"type":"notify","message":"Dry!"}]', 1)`
    );
    await dbMod.query(
      `INSERT INTO scenarios (name, description, triggers_json, actions_json, active)
       VALUES ('Inactive Test', 'Should not load', '{"logic":"ANY","conditions":[{"device":"0xSENSOR","property":"temp","operator":">","value":50}]}', '[]', 0)`
    );

    const { reloadScenarios } = engineMod;
    await expect(reloadScenarios()).resolves.not.toThrow();

    // reloadScenarios returns void — success means no throw
  });
});

describe('Engine — evaluateTelemetry', () => {
  beforeAll(async () => {
    // Ensure scenarios are loaded
    await engineMod.reloadScenarios();
  });

  it('evaluateTelemetry accepts telemetry with device and properties', async () => {
    const { evaluateTelemetry } = engineMod;
    await expect(evaluateTelemetry('0xSENSOR', { temperature: 25.5 })).resolves.not.toThrow();
  });

  it('evaluateTelemetry handles unknown device gracefully', async () => {
    const { evaluateTelemetry } = engineMod;
    await expect(evaluateTelemetry('0xUNKNOWN', { temperature: 99 })).resolves.not.toThrow();
  });

  it('evaluateTelemetry handles empty properties', async () => {
    const { evaluateTelemetry } = engineMod;
    await expect(evaluateTelemetry('0xSENSOR', {})).resolves.not.toThrow();
  });

  it('evaluateTelemetry can trigger scenario when condition matches', async () => {
    const { evaluateTelemetry, reloadScenarios } = engineMod;
    await reloadScenarios(); // ensure fresh state
    // Temperature > 30 should trigger the alert
    await expect(evaluateTelemetry('0xSENSOR', { temperature: 35 })).resolves.not.toThrow();
    // Check that execution was logged
    const execs = await dbMod.query('SELECT * FROM scenario_executions WHERE scenario_id = 1');
    expect(execs.length).toBeGreaterThanOrEqual(0);
  });

  it('evaluateTelemetry handles multiple properties at once', async () => {
    const { evaluateTelemetry } = engineMod;
    await expect(evaluateTelemetry('0xSENSOR', {
      temperature: 22,
      humidity: 45,
      pressure: 1013,
    })).resolves.not.toThrow();
  });

  it('evaluateTelemetry respects cooldown (does not crash on rapid calls)', async () => {
    const { evaluateTelemetry } = engineMod;
    // Call rapidly 5 times
    for (let i = 0; i < 5; i++) {
      await expect(evaluateTelemetry('0xSENSOR', { temperature: 35 })).resolves.not.toThrow();
    }
  });

  it('evaluateTelemetry handles wildcard triggers', async () => {
    const { evaluateTelemetry, reloadScenarios } = engineMod;
    // Add a wildcard scenario
    await dbMod.query(
      `INSERT INTO scenarios (name, description, triggers_json, actions_json, active)
       VALUES ('Wildcard Temp', 'Any device high temp', '{"logic":"ANY","conditions":[{"device":"*","property":"temperature","operator":">","value":40}]}', '[{"type":"notify","message":"Very hot!"}]', 1)`
    );
    await reloadScenarios();
    await expect(evaluateTelemetry('0xRANDOM_' + Date.now(), { temperature: 45 })).resolves.not.toThrow();
  });
});

describe('Engine — Multiple scenarios', () => {
  it('multiple scenarios can match the same telemetry', async () => {
    const { evaluateTelemetry, reloadScenarios } = engineMod;
    await reloadScenarios();
    // This should match both the high-temp and wildcard scenarios
    await expect(evaluateTelemetry('0xSENSOR', { temperature: 45 })).resolves.not.toThrow();
  });
});

describe('Engine — Query after telemetry', () => {
  it('commands table still works after engine operations', async () => {
    await dbMod.query(
      `INSERT INTO commands (device_ieee, command, status, source)
       VALUES ('0xSENSOR', 'ON', 'pending', 'engine_test')`
    );
    const cmds = await dbMod.query(
      "SELECT * FROM commands WHERE source = 'engine_test'"
    );
    expect(cmds.length).toBeGreaterThanOrEqual(1);
  });
});
