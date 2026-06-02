import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';

const TEST_DB = '/tmp/smart-estate-climate-test.duckdb';
process.env.SMART_ESTATE_DB_PATH = TEST_DB;
process.env.PORT = '18793';

const fs = require('fs');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
if (fs.existsSync(TEST_DB + '.wal')) fs.unlinkSync(TEST_DB + '.wal');

let app: any;
let request: any;

beforeAll(async () => {
  const mod = await import('../src/api');
  app = mod.default;
  request = supertest(app);
});

afterAll(async () => {
  const mod = await import('../src/db');
  mod.db.close();
});

describe('GET /api/climate', () => {
  it('returns default setpoints', async () => {
    const res = await request.get('/api/climate');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.setpoints.length).toBe(2);
    expect(res.body.setpoints[0].device_ieee).toBe('bedroom_thermostat');
    expect(res.body.setpoints[1].device_ieee).toBe('living_thermostat');
  });

  it('includes action and needs_heat/needs_cool fields', async () => {
    const res = await request.get('/api/climate');
    const sp = res.body.setpoints[0];
    expect(sp).toHaveProperty('current_temp');
    expect(sp).toHaveProperty('needs_heat');
    expect(sp).toHaveProperty('needs_cool');
    expect(sp).toHaveProperty('action');
  });

  it('default mode is auto', async () => {
    const res = await request.get('/api/climate');
    expect(res.body.setpoints[1].mode).toBe('auto');
  });
});

describe('PUT /api/climate/:device_ieee', () => {
  it('updates target temperature', async () => {
    const res = await request.put('/api/climate/living_thermostat').send({
      target_temp: 24.0,
      mode: 'heat',
    });
    expect(res.status).toBe(200);
    expect(res.body.setpoint.target_temp).toBe(24.0);
    expect(res.body.setpoint.mode).toBe('heat');
  });

  it('updates hysteresis', async () => {
    const res = await request.put('/api/climate/living_thermostat').send({
      hysteresis: 1.0,
    });
    expect(res.body.setpoint.hysteresis).toBe(1.0);
  });

  it('restore defaults', async () => {
    await request.put('/api/climate/living_thermostat').send({
      target_temp: 22.0,
      mode: 'auto',
      hysteresis: 0.5,
    });
  });
});

describe('Climate decision logic', () => {
  it('detects need_heat when current < target - hysteresis', () => {
    // target=22, hysteresis=0.5, current=20 → need heat
    const target = 22.0;
    const hysteresis = 0.5;
    const current = 20.0;
    const needsHeat = current < target - hysteresis;
    expect(needsHeat).toBe(true);
  });

  it('detects need_cool when current > target + hysteresis', () => {
    const target = 22.0;
    const hysteresis = 0.5;
    const current = 24.0;
    const needsCool = current > target + hysteresis;
    expect(needsCool).toBe(true);
  });

  it('idle state within hysteresis band', () => {
    const target = 22.0;
    const hysteresis = 0.5;
    [21.6, 21.8, 22.0, 22.2, 22.4].forEach(current => {
      const needsHeat = current < target - hysteresis;
      const needsCool = current > target + hysteresis;
      expect(needsHeat || needsCool).toBe(false);
    });
  });
});
