import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const TEST_DB = '/tmp/smart-estate-cli-test-unit.db';
process.env.SMART_ESTATE_DB_PATH = TEST_DB;

const fs = require('fs');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
if (fs.existsSync(TEST_DB + '.wal')) fs.unlinkSync(TEST_DB + '.wal');

let dbMod: any;

beforeAll(async () => {
  dbMod = await import('../src/db');

  // Seed test data
  await dbMod.query(
    `INSERT OR IGNORE INTO devices (ieee_addr, friendly_name, model, vendor, type, room_id, status)
     VALUES ('0xCLI001', 'cli_temp', 'TH-01', 'Aqara', 'sensor', 1, 'online')`
  );
  await dbMod.query(
    `INSERT OR IGNORE INTO devices (ieee_addr, friendly_name, model, vendor, type, room_id, status)
     VALUES ('0xCLI002', 'cli_switch', 'SW-01', 'Shelly', 'switch', 2, 'offline')`
  );
  await dbMod.query(
    `INSERT OR IGNORE INTO telemetry (device_ieee, property, value, unit)
     VALUES ('0xCLI001', 'temperature', 23.5, '°C')`
  );
  await dbMod.query(
    `INSERT OR IGNORE INTO telemetry (device_ieee, property, value, unit)
     VALUES ('0xCLI001', 'humidity', 55, '%')`
  );
});

afterAll(async () => {
  if (dbMod.db && typeof dbMod.db.close === 'function') dbMod.db.close();
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.unlinkSync(TEST_DB + '.wal'); } catch {}
  try { fs.unlinkSync(TEST_DB + '.shm'); } catch {}
});

describe('CLI — DB Query Functions', () => {
  it('query returns devices', async () => {
    const devices = await dbMod.query('SELECT * FROM devices ORDER BY ieee_addr');
    expect(devices.length).toBeGreaterThanOrEqual(2);
    expect(devices[0].friendly_name).toBeTruthy();
  });

  it('query returns telemetry for specific device', async () => {
    const rows = await dbMod.query(
      "SELECT * FROM telemetry WHERE device_ieee = '0xCLI001' ORDER BY ts DESC"
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const props = rows.map((r: any) => r.property);
    expect(props).toContain('temperature');
    expect(props).toContain('humidity');
  });

  it('query returns online device count', async () => {
    const rows = await dbMod.query(
      "SELECT COUNT(*) as cnt FROM devices WHERE status = 'online'"
    );
    expect(rows[0].cnt).toBeGreaterThanOrEqual(1);
  });

  it('query returns total device count', async () => {
    const rows = await dbMod.query('SELECT COUNT(*) as cnt FROM devices');
    expect(rows[0].cnt).toBeGreaterThanOrEqual(2);
  });
});

describe('CLI — Command Logging', () => {
  it('inserts command with CLI source', async () => {
    await dbMod.query(
      `INSERT INTO commands (device_ieee, command, status, source)
       VALUES ('0xCLI001', 'ON', 'pending', 'cli')`
    );
    const cmds = await dbMod.query(
      "SELECT * FROM commands WHERE source = 'cli'"
    );
    expect(cmds.length).toBeGreaterThanOrEqual(1);
    expect(cmds[0].command).toBe('ON');
  });

  it('inserts command with success status', async () => {
    await dbMod.query(
      `INSERT INTO commands (device_ieee, command, status, source)
       VALUES ('0xCLI002', 'OFF', 'success', 'cli')`
    );
    const cmds = await dbMod.query(
      "SELECT * FROM commands WHERE device_ieee = '0xCLI002' AND command = 'OFF'"
    );
    expect(cmds.length).toBeGreaterThanOrEqual(1);
    expect(cmds[0].status).toBe('success');
  });
});

describe('CLI — Events Query', () => {
  it('errors table exists and can be queried', async () => {
    const rows = await dbMod.query('SELECT COUNT(*) as cnt FROM errors');
    expect(rows[0].cnt).toBeGreaterThanOrEqual(0);
  });

  it('state_changes table exists', async () => {
    const rows = await dbMod.query('SELECT COUNT(*) as cnt FROM state_changes');
    expect(rows[0].cnt).toBeGreaterThanOrEqual(0);
  });
});

describe('CLI — Scenarios Query', () => {
  it('scenarios table query works', async () => {
    const rows = await dbMod.query('SELECT * FROM scenarios');
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe('CLI — Stats', () => {
  it('daily telemetry query works', async () => {
    const rows = await dbMod.query(
      "SELECT COUNT(*) as cnt FROM telemetry WHERE ts >= CURRENT_DATE"
    );
    expect(rows[0].cnt).toBeGreaterThanOrEqual(0);
  });
});
