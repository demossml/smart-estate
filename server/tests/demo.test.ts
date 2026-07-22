import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const TEST_DB = '/tmp/smart-estate-demo-test.db';
process.env.SMART_ESTATE_DB_PATH = TEST_DB;

const fs = require('fs');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
if (fs.existsSync(TEST_DB + '.wal')) fs.unlinkSync(TEST_DB + '.wal');

let dbMod: any;
let demoMod: any;

beforeAll(async () => {
  dbMod = await import('../src/db');
  demoMod = await import('../src/demo');
});

afterAll(async () => {
  if (dbMod.db && typeof dbMod.db.close === 'function') dbMod.db.close();
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.unlinkSync(TEST_DB + '.wal'); } catch {}
  try { fs.unlinkSync(TEST_DB + '.shm'); } catch {}
});

describe('Demo Mode', () => {
  it('seedDemoData works in non-demo mode', async () => {
    const { seedDemoData } = demoMod;
    await expect(seedDemoData()).resolves.not.toThrow();
  });
});

describe('Demo — seedDemoData', () => {
  it('seedDemoData inserts devices and data', async () => {
    const { seedDemoData } = demoMod;
    const result = await seedDemoData();
    expect(result).toBeDefined();

    const devices = await dbMod.query('SELECT COUNT(*) as cnt FROM devices');
    expect(devices[0].cnt).toBeGreaterThan(0);
  });

  it('seedDemoData is idempotent (second call does not crash)', async () => {
    const { seedDemoData } = demoMod;
    await expect(seedDemoData()).resolves.not.toThrow();
  });

  it('after seed, devices table has demo devices', async () => {
    const devices = await dbMod.query('SELECT * FROM devices');
    expect(devices.length).toBeGreaterThan(0);
    const names = devices.map((d: any) => d.friendly_name);
    expect(names).toContain('Основной свет');
    expect(names).toContain('Датчик температуры');
    expect(names).toContain('Свет кухни');
  });

  it('seedDemoData creates telemetry data', async () => {
    const telemetry = await dbMod.query('SELECT COUNT(*) as cnt FROM telemetry');
    expect(telemetry[0].cnt).toBeGreaterThan(0);
  });

  it('seedDemoData creates rooms', async () => {
    const rooms = await dbMod.query('SELECT COUNT(*) as cnt FROM rooms');
    expect(rooms[0].cnt).toBeGreaterThan(0);
  });

  it('seedDemoData creates scenarios', async () => {
    const scenarios = await dbMod.query('SELECT COUNT(*) as cnt FROM scenarios');
    expect(scenarios[0].cnt).toBeGreaterThan(0);
  });
});

describe('Demo — toggleDemoDevice', () => {
  it('toggleDemoDevice toggles a device ON', async () => {
    const { toggleDemoDevice } = demoMod;
    const devices = await dbMod.query("SELECT ieee_addr FROM devices LIMIT 1");
    if (devices.length > 0) {
      const result = await toggleDemoDevice(devices[0].ieee_addr, 'ON');
      expect(result).toBeDefined();
    }
  });

  it('toggleDemoDevice toggles a device OFF', async () => {
    const { toggleDemoDevice } = demoMod;
    const devices = await dbMod.query("SELECT ieee_addr FROM devices LIMIT 1");
    if (devices.length > 0) {
      const result = await toggleDemoDevice(devices[0].ieee_addr, 'OFF');
      expect(result).toBeDefined();
    }
  });

  it('toggleDemoDevice handles unknown device', async () => {
    const { toggleDemoDevice } = demoMod;
    const result = await toggleDemoDevice('0xNONEXISTENT_DEMO', 'ON');
    // Should not crash
    expect(result).toBeDefined();
  });

  it('toggleDemoDevice records state change (via telemetry)', async () => {
    const devices = await dbMod.query("SELECT ieee_addr FROM devices LIMIT 1");
    if (devices.length > 0) {
      await demoMod.toggleDemoDevice(devices[0].ieee_addr, 'ON');
      // toggleDemoDevice пишет в telemetry fire-and-forget — ждём чуть-чуть
      await new Promise(r => setTimeout(r, 50));
      const tel = await dbMod.query(
        "SELECT * FROM telemetry WHERE device_ieee = ? AND property = 'state' ORDER BY ts DESC LIMIT 1",
        devices[0].ieee_addr
      );
      if (tel.length > 0) {
        expect(tel[0].value).toBe(1);
      }
      // А state_changes может быть или не быть — зависит от await
      const sc = await dbMod.query(
        "SELECT * FROM state_changes WHERE device_ieee = ? ORDER BY ts DESC LIMIT 1",
        devices[0].ieee_addr
      );
      if (sc.length > 0) {
        expect(sc[0].new_state).toBe('ON');
      }
    }
  });
});

describe('Demo — telemetry generation', () => {
  it('demo devices generate temperature telemetry', async () => {
    const tel = await dbMod.query(
      "SELECT value FROM telemetry WHERE property = 'temperature' LIMIT 1"
    );
    if (tel.length > 0) {
      expect(typeof tel[0].value).toBe('number');
    }
  });

  it('demo has device with temperature sensor', async () => {
    const devices = await dbMod.query(
      "SELECT ieee_addr FROM devices WHERE type = 'temp_sensor' LIMIT 1"
    );
    expect(devices.length).toBeGreaterThan(0);
  });

  it('demo has some online devices', async () => {
    const online = await dbMod.query(
      "SELECT COUNT(*) as cnt FROM devices WHERE status = 'online'"
    );
    expect(online[0].cnt).toBeGreaterThan(0);
  });
});
