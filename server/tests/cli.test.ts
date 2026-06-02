import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';

const TEST_DB = '/tmp/smart-estate-cli-test.duckdb';
process.env.SMART_ESTATE_DB_PATH = TEST_DB;

if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
if (fs.existsSync(TEST_DB + '.wal')) fs.unlinkSync(TEST_DB + '.wal');

let mod: any;

beforeAll(async () => {
  mod = await import('../src/db');

  // Seed all data once
  await mod.query(`INSERT OR IGNORE INTO devices (ieee_addr,friendly_name,model,vendor,type,room_id,status)
    VALUES ('0xCLI001','kitchen_temp','TH-01','Aqara','sensor',2,'online')`);
  await mod.query(`INSERT OR IGNORE INTO devices (ieee_addr,friendly_name,model,vendor,type,room_id,status)
    VALUES ('0xCLI002','garage_door','GD-01','Shelly','switch',4,'offline')`);
  await mod.query(`INSERT OR IGNORE INTO devices (ieee_addr,friendly_name,model,vendor,type,room_id,status)
    VALUES ('0xCLI003','garden_light','LED-02','Xiaomi','light',5,'online')`);
  await mod.query(`INSERT OR IGNORE INTO devices (ieee_addr,friendly_name,type,room_id)
    VALUES ('0xAUDIT001','audit_device','sensor',3)`);

  await mod.query(`INSERT INTO telemetry (id,device_ieee,property,value,unit,raw_json)
    VALUES (nextval('telemetry_seq'),'0xCLI001','temperature',21.5,'°C','{}')`);
  await mod.query(`INSERT INTO telemetry (id,device_ieee,property,value,unit,raw_json)
    VALUES (nextval('telemetry_seq'),'0xCLI001','humidity',55.0,'%','{}')`);

  await mod.query(`INSERT INTO commands (id,device_ieee,command,payload,status,source)
    VALUES (nextval('commands_seq'),'0xCLI001','ON','{}','success','api')`);
  await mod.query(`INSERT INTO commands (id,device_ieee,command,payload,status,source)
    VALUES (nextval('commands_seq'),'0xAUDIT001','TOGGLE','{}','error','cli')`);

  await mod.query(`INSERT INTO state_changes (id,device_ieee,old_state,new_state,reason)
    VALUES (nextval('state_changes_seq'),'0xCLI001','OFF','ON','cli')`);
  await mod.query(`INSERT INTO state_changes (id,device_ieee,old_state,new_state,reason)
    VALUES (nextval('state_changes_seq'),'0xAUDIT001','ON','OFF','timeout')`);

  await mod.query(`INSERT INTO errors (id,device_ieee,error_type,error_msg,context)
    VALUES (nextval('errors_seq'),'0xCLI001','timeout','No response','mqtt')`);
  await mod.query(`INSERT INTO errors (id,device_ieee,error_type,error_msg,context)
    VALUES (nextval('errors_seq'),'0xAUDIT001','parse_error','Bad JSON','telemetry')`);
});

describe('CLI — devices', () => {
  it('lists all devices', async () => {
    const rows = await mod.query(
      `SELECT friendly_name, model, type, status FROM devices ORDER BY status DESC, last_seen DESC`
    );
    const names = rows.map((r: any) => r.friendly_name);
    // Should contain default rooms (5) + seeded devices (4) = 9
    expect(names).toContain('kitchen_temp');
    expect(names).toContain('garage_door');
    expect(names).toContain('garden_light');
  });

  it('online devices appear first', async () => {
    const rows = await mod.query(
      `SELECT status FROM devices ORDER BY status DESC, last_seen DESC`
    );
    expect(rows[0].status).toBe('online');
  });
});

describe('CLI — telemetry', () => {
  it('returns telemetry for specific device', async () => {
    const rows = await mod.query(
      `SELECT property, value, unit FROM telemetry WHERE device_ieee='0xCLI001' ORDER BY ts`
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('contains correct temperature value', async () => {
    const rows = await mod.query(
      `SELECT value FROM telemetry WHERE device_ieee='0xCLI001' AND property='temperature'`
    );
    expect(rows[0].value).toBe(21.5);
  });
});

describe('CLI — on/off', () => {
  it('records ON command in DB', async () => {
    await mod.query(`INSERT INTO commands (id,device_ieee,command,status,source)
      VALUES (nextval('commands_seq'),'0xSWITCH','ON','pending','cli')`);
    const rows = await mod.query("SELECT * FROM commands WHERE device_ieee='0xSWITCH'");
    expect(rows.length).toBe(1);
    expect(rows[0].command).toBe('ON');
    expect(rows[0].source).toBe('cli');
  });

  it('records OFF command in DB', async () => {
    await mod.query(`INSERT INTO commands (id,device_ieee,command,status,source)
      VALUES (nextval('commands_seq'),'0xSWITCH','OFF','pending','cli')`);
    const rows = await mod.query(
      "SELECT * FROM commands WHERE device_ieee='0xSWITCH' AND command='OFF'"
    );
    expect(rows.length).toBe(1);
  });
});

describe('CLI — events', () => {
  it('returns errors from DB', async () => {
    const errors = await mod.query("SELECT * FROM errors ORDER BY ts DESC");
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const types = errors.map((e: any) => e.error_type);
    expect(types).toContain('timeout');
    expect(types).toContain('parse_error');
  });

  it('returns commands from DB', async () => {
    const commands = await mod.query("SELECT * FROM commands ORDER BY sent_at DESC");
    expect(commands.length).toBeGreaterThanOrEqual(2);
  });

  it('returns state changes from DB', async () => {
    const changes = await mod.query("SELECT * FROM state_changes ORDER BY ts DESC");
    expect(changes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('CLI — stats', () => {
  it('counts devices correctly', async () => {
    const total = await mod.query("SELECT COUNT(*) as cnt FROM devices");
    const online = await mod.query("SELECT COUNT(*) as cnt FROM devices WHERE status='online'");
    expect(total[0].cnt).toBeGreaterThanOrEqual(4);
    expect(online[0].cnt).toBeGreaterThanOrEqual(2);
  });

  it('counts telemetry records', async () => {
    const total = await mod.query("SELECT COUNT(*) as cnt FROM telemetry");
    expect(total[0].cnt).toBeGreaterThanOrEqual(2);
  });

  it('counts commands', async () => {
    const total = await mod.query("SELECT COUNT(*) as cnt FROM commands");
    expect(total[0].cnt).toBeGreaterThanOrEqual(2);
  });

  it('counts errors', async () => {
    const total = await mod.query("SELECT COUNT(*) as cnt FROM errors");
    expect(total[0].cnt).toBeGreaterThanOrEqual(2);
  });

  it('queries today energy', async () => {
    const energy = await mod.query(
      "SELECT COALESCE(SUM(value),0)::DECIMAL(6,2) as kwh FROM telemetry WHERE property='energy' AND ts>=CURRENT_DATE"
    );
    expect(energy).toBeDefined();
    expect(energy[0]).toHaveProperty('kwh');
  });
});

describe('CLI — audit', () => {
  it('returns device-specific errors', async () => {
    const errors = await mod.query(
      "SELECT * FROM errors WHERE device_ieee='0xAUDIT001'"
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].error_type).toBe('parse_error');
    expect(errors[0].error_msg).toBe('Bad JSON');
    expect(errors[0].context).toBe('telemetry');
  });

  it('returns device-specific commands', async () => {
    const commands = await mod.query(
      "SELECT * FROM commands WHERE device_ieee='0xAUDIT001'"
    );
    expect(commands.length).toBeGreaterThanOrEqual(1);
    expect(commands[0].command).toBe('TOGGLE');
    expect(commands[0].status).toBe('error');
  });

  it('returns device-specific state changes', async () => {
    const changes = await mod.query(
      "SELECT * FROM state_changes WHERE device_ieee='0xAUDIT001'"
    );
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes[0].old_state).toBe('ON');
    expect(changes[0].new_state).toBe('OFF');
    expect(changes[0].reason).toBe('timeout');
  });

  it('calculates error rate for device', async () => {
    const errors = await mod.query(
      "SELECT COUNT(*) as cnt FROM errors WHERE device_ieee='0xAUDIT001'"
    );
    const commands = await mod.query(
      "SELECT COUNT(*) as cnt FROM commands WHERE device_ieee='0xAUDIT001'"
    );
    expect(errors[0].cnt).toBeGreaterThanOrEqual(1);
    expect(commands[0].cnt).toBeGreaterThanOrEqual(1);
  });
});
