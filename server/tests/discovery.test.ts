import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, getRequest, getCsrf, cleanTestDb } from './setup';

// PORT — уникальный, чтобы файлы не конфликтовали при параллельном запуске
process.env.PORT = '18795';
cleanTestDb();

let app: any;
let request: any;
let csrfToken = '';
let csrfCookie = '';

function api(url: string) {
  return request.get(url).set('X-API-Key', 'test-key-12345');
}

function apiPost(url: string) {
  const r = request.post(url).set('X-API-Key', 'test-key-12345');
  if (csrfToken) r.set('X-CSRF-Token', csrfToken);
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

describe('POST /api/discovery/start', () => {
  it('enables permit_join and returns ok:true', async () => {
    const res = await apiPost('/api/discovery/start');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.permit_join).toBe(true);
  });

  it('returns 200 even if MQTT is unavailable', async () => {
    const res = await apiPost('/api/discovery/start');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/discovery/stop', () => {
  it('disables permit_join and returns ok:true', async () => {
    const res = await apiPost('/api/discovery/stop');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.permit_join).toBe(false);
  });
});

describe('POST /api/discovery/:ieee/confirm', () => {
  it('requires name', async () => {
    const res = await apiPost('/api/discovery/0x1234567890abcdef/confirm')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain('name');
  });

  it('creates device when name is provided', async () => {
    const res = await apiPost('/api/discovery/0x1234567890abcdef/confirm')
      .send({ name: 'Test Sensor', roomId: 1 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.device.ieee_addr).toBe('0x1234567890abcdef');
    expect(res.body.device.friendly_name).toBe('Test Sensor');
  });
});

// ── GET /api/discovery/events (SSE) — skip (SSE endpoint, требует реального HTTP)
// SSE-эндпоинт использует res.write() + setInterval + res.on('close'),
// supertest не поддерживает корректное закрытие SSE-соединений.
// Протестировано вручную: curl http://localhost:8788/api/discovery/events
// возвращает text/event-stream с данными discovery.
