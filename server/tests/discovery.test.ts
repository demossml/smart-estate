import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, getRequest, cleanTestDb } from './setup';

// PORT — уникальный, чтобы файлы не конфликтовали при параллельном запуске
process.env.PORT = '18795';
cleanTestDb();

let app: any;
let request: any;


function api(url: string) {
  return request.get(url).set('X-API-Key', 'test-key-12345');
}

function apiPost(url: string) {
  const r = request.post(url).set('X-API-Key', 'test-key-12345');
  return r;
}

beforeAll(async () => {
  app = await getApp();
  request = getRequest(app);

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

// ── GET /api/discovery/events (SSE) ────────────────────
describe('GET /api/discovery/events (SSE)', () => {
  it('returns SSE stream with initial existing events', { timeout: 8000 }, async () => {
    const res = await api('/api/discovery/events');
    // After fixing require('./db') -> stmt, SSE endpoint works via supertest
    // Supertest auto-closes the connection after receiving headers + first data
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.text).toContain('existing');
  });
});
