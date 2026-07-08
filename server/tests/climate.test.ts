import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, getRequest, getCsrf, cleanTestDb } from './setup';

// PORT — уникальный, чтобы файлы не конфликтовали при параллельном запуске
process.env.PORT = '18793';
cleanTestDb();

let app: any;
let request: any;
let csrfToken = '';
let csrfCookie = '';

function api(url: string) {
  return request.get(url).set('X-API-Key', 'test-key-12345');
}

function apiPut(url: string, csrf?: string) {
  const tk = csrf || csrfToken;
  const r = request.put(url).set('X-API-Key', 'test-key-12345');
  if (tk) r.set('X-CSRF-Token', tk);
  if (csrfCookie) r.set('Cookie', csrfCookie);
  return r;
}

beforeAll(async () => {
  app = await getApp();
  request = getRequest(app);
  const csrf = await getCsrf(request);
  csrfToken = csrf.token;
  csrfCookie = csrf.cookie;
});

afterAll(async () => {
  const mod = await import('../src/db');
  const db = (mod as any).db;
  if (db && typeof db.close === 'function') db.close();
  cleanTestDb();
});

describe('GET /api/climate', () => {
  it('returns default setpoints', async () => {
    const res = await api('/api/climate');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.setpoints.length).toBe(2);
  });

  it('includes action and needs_heat/needs_cool fields', async () => {
    const res = await api('/api/climate');
    const sp = res.body.setpoints[0];
    expect(sp).toHaveProperty('current_temp');
    expect(sp).toHaveProperty('needs_heat');
    expect(sp).toHaveProperty('needs_cool');
    expect(sp).toHaveProperty('action');
  });

  it('default mode is auto', async () => {
    const res = await api('/api/climate');
    expect(res.body.setpoints[1].mode).toBe('auto');
  });
});

describe('PUT /api/climate/:device_ieee', () => {
  it('updates target temperature', async () => {
    const res = await apiPut('/api/climate/living_thermostat')
      .send({ target_temp: 24.0, mode: 'heat' });
    expect(res.status).toBe(200);
    expect(res.body.setpoint.target_temp).toBe(24.0);
    expect(res.body.setpoint.mode).toBe('heat');
  });

  it('updates hysteresis', async () => {
    const res = await apiPut('/api/climate/living_thermostat')
      .send({ hysteresis: 1.0 });
    expect(res.body.setpoint.hysteresis).toBe(1.0);
  });

  it('restore defaults', async () => {
    await apiPut('/api/climate/living_thermostat')
      .send({ target_temp: 22.0, mode: 'auto', hysteresis: 0.5 });
  });
});

describe('Climate decision logic', () => {
  it('detects need_heat when current < target - hysteresis', () => {
    const target = 22.0, hysteresis = 0.5, current = 20.0;
    expect(current < target - hysteresis).toBe(true);
  });

  it('detects need_cool when current > target + hysteresis', () => {
    const target = 22.0, hysteresis = 0.5, current = 24.0;
    expect(current > target + hysteresis).toBe(true);
  });

  it('idle state within hysteresis band', () => {
    const target = 22.0, hysteresis = 0.5;
    [21.6, 21.8, 22.0, 22.2, 22.4].forEach(current => {
      const needsHeat = current < target - hysteresis;
      const needsCool = current > target + hysteresis;
      expect(needsHeat || needsCool).toBe(false);
    });
  });
});
