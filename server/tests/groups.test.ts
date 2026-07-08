import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { getApp, getRequest, cleanTestDb } from './setup';

// PORT — уникальный, чтобы файлы не конфликтовали при параллельном запуске
process.env.PORT = '18792';

cleanTestDb();

let app: any;
let request: any;


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

function api(url: string) {
  return request.get(url).set('X-API-Key', 'test-key-12345');
}

function apiPost(url: string) {
  return request.post(url).set('X-API-Key', 'test-key-12345');
}

describe('GET /api/groups', () => {
  it('returns all 6 default groups', async () => {
    const res = await api('/api/groups');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.groups.length).toBe(6);
  });

  it('each group has device_count', async () => {
    const res = await api('/api/groups');
    expect(res.body.groups[0]).toHaveProperty('device_count');
  });
});

describe('GET /api/groups/:id', () => {
  it('returns group with empty members', async () => {
    const res = await api('/api/groups/1');
    expect(res.status).toBe(200);
    expect(res.body.group.name).toBe('Весь свет');
    expect(res.body.members).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it('returns 404 for unknown group', async () => {
    const res = await api('/api/groups/999');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/groups/:id/add-device', () => {
  beforeAll(async () => {
    const mod = await import('../src/db');
    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,type,room_id)
      VALUES ('0xGRP001','living_light','light',1) ON CONFLICT DO NOTHING`);
    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,type,room_id)
      VALUES ('0xGRP002','kitchen_light','light',2) ON CONFLICT DO NOTHING`);
    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,type,room_id)
      VALUES ('0xGRP003','garden_light','light',5) ON CONFLICT DO NOTHING`);
  });

  it('adds device to group', async () => {
    const res = await apiPost('/api/groups/1/add-device')
      .send({ device_ieee: '0xGRP001' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('adds multiple devices to group', async () => {
    await apiPost('/api/groups/1/add-device')
      .send({ device_ieee: '0xGRP002' });
    await apiPost('/api/groups/1/add-device')
      .send({ device_ieee: '0xGRP003' });

    const res = await api('/api/groups/1');
    expect(res.body.count).toBe(3);
  });

  it('returns 400 without device_ieee', async () => {
    const res = await apiPost('/api/groups/1/add-device')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/groups/:id/all-on', () => {
  it('turns all devices in group ON', async () => {
    const res = await apiPost('/api/groups/1/all-on');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.devices_controlled).toBe(3);
  });

  it('works on empty group', async () => {
    const res = await apiPost('/api/groups/3/all-on');
    expect(res.status).toBe(200);
    expect(res.body.devices_controlled).toBe(0);
  });
});

describe('POST /api/groups/:id/all-off', () => {
  it('turns all devices OFF', async () => {
    const res = await apiPost('/api/groups/1/all-off');
    expect(res.status).toBe(200);
    expect(res.body.devices_controlled).toBe(3);
  });
});

describe('POST /api/groups/:id/remove-device', () => {
  it('removes device from group', async () => {
    const res = await apiPost('/api/groups/1/remove-device')
      .send({ device_ieee: '0xGRP003' });
    expect(res.status).toBe(200);

    const check = await api('/api/groups/1');
    expect(check.body.count).toBe(2);
  });
});
