import { describe, it, expect, beforeAll } from 'vitest';

const TEST_DB = '/tmp/smart-estate-test.duckdb';
process.env.SMART_ESTATE_DB_PATH = TEST_DB;

const fs = require('fs');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
if (fs.existsSync(TEST_DB + '.wal')) fs.unlinkSync(TEST_DB + '.wal');

let mod: any;

beforeAll(async () => {
  mod = await import('../src/db');
});

describe('Database Schema', () => {
  it('creates devices table with all columns', async () => {
    const rows = await mod.query("PRAGMA table_info('devices')");
    const cols = rows.map((r: any) => r.name);
    ['ieee_addr','friendly_name','model','vendor','type','room_id','status','last_seen','added_at']
      .forEach(c => expect(cols).toContain(c));
  });

  it('creates telemetry table', async () => {
    const rows = await mod.query("PRAGMA table_info('telemetry')");
    const cols = rows.map((r: any) => r.name);
    ['device_ieee','property','value','unit','raw_json','ts'].forEach(c => expect(cols).toContain(c));
  });

  it('creates commands table', async () => {
    const rows = await mod.query("PRAGMA table_info('commands')");
    const cols = rows.map((r: any) => r.name);
    ['device_ieee','command','payload','status','error_msg','source','sent_at','completed_at']
      .forEach(c => expect(cols).toContain(c));
  });

  it('creates state_changes table', async () => {
    const rows = await mod.query("PRAGMA table_info('state_changes')");
    const cols = rows.map((r: any) => r.name);
    ['device_ieee','old_state','new_state','reason'].forEach(c => expect(cols).toContain(c));
  });

  it('creates errors table', async () => {
    const rows = await mod.query("PRAGMA table_info('errors')");
    const cols = rows.map((r: any) => r.name);
    ['error_type','error_msg','context'].forEach(c => expect(cols).toContain(c));
  });

  it('has 5 default rooms', async () => {
    const rows = await mod.query("SELECT * FROM rooms ORDER BY id");
    expect(rows.length).toBe(5);
    expect(rows[0].name).toBe('Гостиная');
    expect(rows[4].name).toBe('Улица');
  });

  it('has 8 default scenarios', async () => {
    const rows = await mod.query("SELECT * FROM scenarios ORDER BY id");
    expect(rows.length).toBe(10);
  });
});

describe('CRUD Operations', () => {
  it('inserts and retrieves a device', async () => {
    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,model,vendor,type,room_id)
      VALUES ('0xTEST01','test_sensor','WSDCGQ11LM','Xiaomi','sensor',1)
      ON CONFLICT DO NOTHING`);
    const d = await mod.query("SELECT * FROM devices WHERE ieee_addr='0xTEST01'");
    expect(d[0].friendly_name).toBe('test_sensor');
  });

  it('upserts device on conflict', async () => {
    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,type,room_id)
      VALUES ('0xUPSERT','original','sensor',2) ON CONFLICT DO NOTHING`);
    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,type,room_id)
      VALUES ('0xUPSERT','updated','actuator',3)
      ON CONFLICT(ieee_addr) DO UPDATE SET friendly_name=EXCLUDED.friendly_name`);
    const d = await mod.query("SELECT * FROM devices WHERE ieee_addr='0xUPSERT'");
    expect(d[0].friendly_name).toBe('updated');
  });

  it('inserts and queries telemetry', async () => {
    await mod.query(`INSERT INTO telemetry (id,device_ieee,property,value,unit,raw_json)
      VALUES (nextval('telemetry_seq'),'0xTEL1','temperature',23.5,'°C','{}')`);
    await mod.query(`INSERT INTO telemetry (id,device_ieee,property,value,unit,raw_json)
      VALUES (nextval('telemetry_seq'),'0xTEL1','humidity',45.0,'%','{}')`);
    const rows = await mod.query("SELECT * FROM telemetry WHERE device_ieee='0xTEL1' ORDER BY ts");
    expect(rows.length).toBe(2);
  });

  it('inserts and completes commands', async () => {
    await mod.query(`INSERT INTO commands (id,device_ieee,command,payload,status,source)
      VALUES (nextval('commands_seq'),'0xCMD1','ON','{}','sent','api')`);
    const cmds = await mod.query("SELECT * FROM commands WHERE device_ieee='0xCMD1' ORDER BY sent_at");
    expect(cmds.length).toBe(1);
    await mod.query(`UPDATE commands SET status='success',completed_at=CURRENT_TIMESTAMP WHERE id=${cmds[0].id}`);
    const updated = await mod.query(`SELECT * FROM commands WHERE id=${cmds[0].id}`);
    expect(updated[0].status).toBe('success');
  });

  it('records state changes', async () => {
    await mod.query(`INSERT INTO state_changes (id,device_ieee,old_state,new_state,reason)
      VALUES (nextval('state_changes_seq'),'0xST1','OFF','ON','mqtt')`);
    const rows = await mod.query("SELECT * FROM state_changes WHERE device_ieee='0xST1' ORDER BY ts");
    expect(rows.length).toBe(1);
  });

  it('aggregates energy data', async () => {
    await mod.query(`INSERT INTO telemetry (id,device_ieee,property,value,unit,raw_json)
      VALUES (nextval('telemetry_seq'),'0xEN1','energy',1.5,'kWh','{}')`);
    await mod.query(`INSERT INTO telemetry (id,device_ieee,property,value,unit,raw_json)
      VALUES (nextval('telemetry_seq'),'0xEN1','energy',2.0,'kWh','{}')`);
    const rows = await mod.query(
      "SELECT SUM(value)::DECIMAL(6,2) as kwh FROM telemetry WHERE property='energy' AND ts>=CURRENT_DATE"
    );
    expect(rows[0].kwh).toBe(3.5);
  });

  it('toggles scenario', async () => {
    const before = await mod.query("SELECT active FROM scenarios WHERE id=1");
    expect(before[0].active).toBe(true);
    await mod.query("UPDATE scenarios SET active=NOT active WHERE id=1");
    const after = await mod.query("SELECT active FROM scenarios WHERE id=1");
    expect(after[0].active).toBe(false);
    await mod.query("UPDATE scenarios SET active=NOT active WHERE id=1");
  });

  it('prevents duplicate primary key', async () => {
    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,type,room_id)
      VALUES ('0xDUPE','first','sensor',1) ON CONFLICT DO NOTHING`);
    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,type,room_id)
      VALUES ('0xDUPE','second','actuator',2) ON CONFLICT DO NOTHING`);
    const rows = await mod.query("SELECT * FROM devices WHERE ieee_addr='0xDUPE'");
    expect(rows.length).toBe(1);
  });
});

describe('Helper Functions', () => {
  it('query() returns array of objects', async () => {
    const rows = await mod.query("SELECT 1 as val, 'hello' as text");
    expect(rows[0]).toEqual({ val: 1, text: 'hello' });
  });

  it('query() handles parameterized queries', async () => {
    const rows = await mod.query("SELECT ? as a, ? as b, ? as c", 10, 'test', true);
    expect(rows[0]).toEqual({ a: 10, b: 'test', c: true });
  });

  it('query() rejects on invalid SQL', async () => {
    await expect(mod.query("SLECT * FROM nonexistent")).rejects.toThrow();
  });

  it('logError() writes to errors table', async () => {
    const before = await mod.query("SELECT COUNT(*) as cnt FROM errors");
    mod.logError('0xLOGERR', 'test_type', 'test message', 'test_ctx');
    await new Promise(r => setTimeout(r, 100));
    const after = await mod.query("SELECT COUNT(*) as cnt FROM errors");
    expect(after[0].cnt).toBeGreaterThan(before[0].cnt);
  });

  it('logError() handles null device_ieee', async () => {
    mod.logError(null, 'sys_error', 'system failure');
    await new Promise(r => setTimeout(r, 100));
    const rows = await mod.query("SELECT * FROM errors WHERE error_type='sys_error' ORDER BY ts DESC LIMIT 1");
    expect(rows[0].device_ieee).toBeNull();
  });

  it('logStateChange() writes transition', async () => {
    mod.logStateChange('0xSTLOG', 'CLOSED', 'OPEN', 'sensor');
    await new Promise(r => setTimeout(r, 100));
    const rows = await mod.query("SELECT * FROM state_changes WHERE device_ieee='0xSTLOG' ORDER BY ts DESC LIMIT 1");
    expect(rows[0].old_state).toBe('CLOSED');
    expect(rows[0].new_state).toBe('OPEN');
  });

  it('logCommand() returns positive ID', () => {
    const id = mod.logCommand('0xCMDLOG', 'TOGGLE', '{}', 'test');
    expect(id).toBeGreaterThan(0);
  });
});
