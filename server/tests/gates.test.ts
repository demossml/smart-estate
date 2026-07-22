import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, getRequest, cleanTestDb } from './setup';

// PORT — уникальный, чтобы файлы не конфликтовали при параллельном запуске
process.env.PORT = '18794';
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

describe('GET /api/gates', () => {
  it('returns empty list when no gates', async () => {
    const res = await api('/api/gates');
    expect(res.status).toBe(200);
    expect(res.body.gates).toEqual([]);
  });
});

describe('POST /api/gates/:id/open and close', () => {
  beforeAll(async () => {
    const mod = await import('../src/db');
    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,type,room_id)
      VALUES ('0xGATE01','main_gate','gate',5) ON CONFLICT DO NOTHING`);
  });

  it('opens a gate and logs access', async () => {
    const res = await apiPost('/api/gates/0xGATE01/open')
      .send({ reason: 'Guest arrived' });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('open');
    expect(res.body.command_id).toBeGreaterThan(0);
  });

  it('closes a gate and logs access', async () => {
    const res = await apiPost('/api/gates/0xGATE01/close')
      .send({ reason: 'Guest left' });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('closed');
  });

  it('returns gate in devices list', async () => {
    const res = await api('/api/devices');
    const gate = res.body.devices.find((d: any) => d.ieee_addr === '0xGATE01');
    expect(gate).toBeDefined();
  });
});

describe('GET /api/gates/access-log', () => {
  it('returns access log entries', async () => {
    const res = await api('/api/gates/access-log');
    expect(res.status).toBe(200);
    expect(res.body.log.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by device', async () => {
    const res = await api('/api/gates/access-log?device=0xGATE01');
    expect(res.body.log.every((e: any) => e.device_ieee === '0xGATE01')).toBe(true);
  });

  it('respects limit', async () => {
    const res = await api('/api/gates/access-log?limit=1');
    expect(res.body.log.length).toBe(1);
  });
});
