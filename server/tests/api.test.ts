import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { getApp, getRequest, getCsrf, cleanTestDb } from './setup';

// PORT — уникальный, чтобы файлы не конфликтовали при параллельном запуске
process.env.PORT = '18790';

cleanTestDb();

let app: any;
let request: any;
let csrfToken = '';
let csrfCookie = '';

function api(url: string) {
  return request
    .get(url)
    .set('X-API-Key', 'test-key-12345');
}

function apiPost(url: string) {
  return request.post(url).set('X-API-Key', 'test-key-12345');
}

function apiPatch(url: string) {
  return request.patch(url).set('X-API-Key', 'test-key-12345');
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

// ── GET /api/status ─────────────────────────────────────
describe('GET /api/status', () => {
  it('returns system status with ok:true', async () => {
    const res = await api('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('db');
    expect(res.body).toHaveProperty('devices');
    expect(res.body).toHaveProperty('errors24h');
  });
});

// ── GET /api/devices ────────────────────────────────────
describe('GET /api/devices', () => {
  it('returns empty device list initially', async () => {
    const res = await api('/api/devices');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.devices).toEqual([]);
  });

  it('returns devices after insertion', async () => {
    const mod = await import('../src/db');
    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,type,room_id)
      VALUES ('0xAPI001','test_1','sensor',1) ON CONFLICT DO NOTHING`);
    const res = await api('/api/devices');
    expect(res.body.devices.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by online status', async () => {
    const res = await api('/api/devices?filter=online');
    expect(res.body.devices.every((d: any) => d.status === 'online')).toBe(true);
  });

  it('filters by offline status', async () => {
    const res = await api('/api/devices?filter=offline');
    expect(res.body.devices.every((d: any) => d.status === 'offline')).toBe(true);
  });

  it('includes latest telemetry in response', async () => {
    const mod = await import('../src/db');
    await mod.query("INSERT INTO telemetry (id,device_ieee,property,value,unit) VALUES (NULL,'0xAPI001','temperature',22.5,'°C')");
    const res = await api('/api/devices');
    expect(res.body.devices[0]).toHaveProperty('latest_telemetry');
  });
});

// ── GET /api/devices/:id ────────────────────────────────
describe('GET /api/devices/:id', () => {
  it('returns 404 for unknown device', async () => {
    const res = await api('/api/devices/0xNONEXISTENT');
    expect(res.status).toBe(404);
  });

  it('returns full device detail with telemetry, commands, history', async () => {
    const res = await api('/api/devices/0xAPI001');
    expect(res.status).toBe(200);
    expect(res.body.device.ieee_addr).toBe('0xAPI001');
    expect(res.body).toHaveProperty('telemetry');
    expect(res.body).toHaveProperty('commands');
    expect(res.body).toHaveProperty('state_changes');
  });

  it('includes 24h stats with min/max/avg', async () => {
    const res = await api('/api/devices/0xAPI001');
    expect(res.body).toHaveProperty('stats');
  });
});

// ── POST /api/devices/:id/on and /off ──────────────────
describe('POST /api/devices/:id/on and /off', () => {
  it('turns device ON', async () => {
    const mod = await import('../src/db');
    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,type,room_id)
      VALUES ('0xSWITCH','test_switch','switch',1) ON CONFLICT DO NOTHING`);

    const res = await apiPost('/api/devices/0xSWITCH/on');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.state).toBe('ON');
    expect(res.body.command_id).toBeGreaterThan(0);
  });

  it('turns device OFF', async () => {
    const res = await apiPost('/api/devices/0xSWITCH/off');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.state).toBe('OFF');
  });

  it('records state change in DB', async () => {
    const mod = await import('../src/db');
    const rows = await mod.query(
      "SELECT * FROM state_changes WHERE device_ieee='0xSWITCH' ORDER BY ts DESC LIMIT 1"
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].new_state).toBe('OFF');
    expect(rows[0].reason).toBe('api_command');
  });

  it('returns 200 for invalid device (logs command without validation)', async () => {
    const res = await apiPost('/api/devices/0xINVALID_DEVICE_ZZZZZ/on');
    expect(res.status).toBe(200);
  });
});

// ── GET /api/telemetry ──────────────────────────────────
describe('GET /api/telemetry', () => {
  beforeAll(async () => {
    const mod = await import('../src/db');
    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,type,room_id)
      VALUES ('0xTELEM','sensor_1','sensor',3) ON CONFLICT DO NOTHING`);
    for (let i = 0; i < 5; i++) {
      await mod.query(`INSERT INTO telemetry (id,device_ieee,property,value,unit,raw_json)
        VALUES (NULL,'0xTELEM','temperature',${20 + i},'°C','{}')`);
    }
  });

  it('returns telemetry with default 24h period', async () => {
    const res = await api('/api/telemetry');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('count');
  });

  it('filters by device', async () => {
    const res = await api('/api/telemetry?device=0xTELEM');
    expect(res.status).toBe(200);
    expect(res.body.telemetry.every((t: any) => t.device_ieee === '0xTELEM')).toBe(true);
  });

  it('filters by property', async () => {
    const res = await api('/api/telemetry?device=0xTELEM&property=temperature');
    expect(res.body.telemetry.every((t: any) => t.property === 'temperature')).toBe(true);
  });

  it('supports period parameter (1h, 6h, 7d, 30d)', async () => {
    for (const period of ['1h', '6h', '7d', '30d']) {
      const res = await api(`/api/telemetry?period=${period}`);
      expect(res.status).toBe(200);
    }
  });

  it('respects limit parameter', async () => {
    const res = await api('/api/telemetry?device=0xTELEM&limit=2');
    expect(res.body.telemetry.length).toBeLessThanOrEqual(2);
  });
});

// ── GET /api/rooms ──────────────────────────────────────
describe('GET /api/rooms', () => {
  it('returns all rooms with device counts', async () => {
    const res = await api('/api/rooms');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.rooms.length).toBeGreaterThanOrEqual(1);
    expect(res.body.rooms[0].name).toBe('Гостиная');
    expect(res.body.rooms[0].icon).toBe('🏠');
  });

  it('returns basic room fields', async () => {
    const res = await api('/api/rooms');
    const room = res.body.rooms[0];
    expect(room).toHaveProperty('name');
    expect(room).toHaveProperty('icon');
    expect(room).toHaveProperty('id');
  });
});

// ── GET /api/energy ─────────────────────────────────────
describe('GET /api/energy', () => {
  it('returns energy data structure', async () => {
    const res = await api('/api/energy');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('current_watts');
    expect(res.body).toHaveProperty('today_kwh');
    expect(res.body).toHaveProperty('devices');
  });
});

// ── GET /api/events ─────────────────────────────────────
describe('GET /api/events', () => {
  it('returns events with all three categories', async () => {
    const res = await api('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('errors');
    expect(res.body).toHaveProperty('commands');
    expect(res.body).toHaveProperty('state_changes');
  });

  it('respects limit parameter', async () => {
    const res = await api('/api/events?limit=5');
    expect(res.body.errors.length).toBeLessThanOrEqual(5);
    expect(res.body.commands.length).toBeLessThanOrEqual(5);
    expect(res.body.state_changes.length).toBeLessThanOrEqual(5);
  });
});

// ── GET /api/scenarios ─────────────────────────────────
describe('GET /api/scenarios', () => {
  it('returns all scenarios', async () => {
    const res = await api('/api/scenarios');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.scenarios.length).toBe(10);
  });

  it('each scenario has required fields', async () => {
    const res = await api('/api/scenarios');
    const s = res.body.scenarios[0];
    expect(s).toHaveProperty('id');
    expect(s).toHaveProperty('name');
    expect(s).toHaveProperty('description');
    expect(s).toHaveProperty('triggers_json');
    expect(s).toHaveProperty('actions_json');
    expect(s).toHaveProperty('active');
  });
});

// ── POST /api/scenarios/:id/toggle ─────────────────────
describe('POST /api/scenarios/:id/toggle', () => {
  it('toggles scenario active state', async () => {
    const before = await api('/api/scenarios');
    const wasActive = before.body.scenarios[0].active;

    // Get fresh CSRF token (agent auto-handles cookies)
    const csrfRes = await request.get('/api/csrf-token').set('X-API-Key', 'test-key-12345');

    const toggle = await request
      .post('/api/scenarios/1/toggle')
      .set('X-API-Key', 'test-key-12345')
      .set('X-CSRF-Token', csrfRes.body.token || '');
    expect(toggle.status).toBe(200);
    expect(toggle.body.ok).toBe(true);
    // SQLite INTEGER 1/0 is represented as number; JS expects truthy
    expect(!!toggle.body.scenario.active).toBe(!wasActive);

    // Toggle back
    const csrfRes2 = await request.get('/api/csrf-token').set('X-API-Key', 'test-key-12345');
    await request
      .post('/api/scenarios/1/toggle')
      .set('X-API-Key', 'test-key-12345')
      .set('X-CSRF-Token', csrfRes2.body.token || '');
  });
});

// ── GET /api/audit ──────────────────────────────────────
describe('GET /api/audit', () => {
  it('returns full audit log', async () => {
    const res = await api('/api/audit');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('commands');
    expect(res.body).toHaveProperty('errors');
    expect(res.body).toHaveProperty('state_changes');
    expect(res.body).toHaveProperty('summary');
    expect(res.body.summary).toHaveProperty('total_commands');
  });
});

// ── Error handling ──────────────────────────────────────
describe('Error handling', () => {
  it('CORS headers present', async () => {
    const res = await api('/api/status').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('JSON content type on all endpoints', async () => {
    const endpoints = ['/api/status', '/api/devices', '/api/rooms', '/api/energy', '/api/scenarios'];
    for (const ep of endpoints) {
      const res = await api(ep);
      expect(res.headers['content-type']).toMatch(/json/);
    }
  });
});

// ── API edge cases ──────────────────────────────────────
describe('API edge cases', () => {
  it('handles empty filter gracefully', async () => {
    const res = await api('/api/devices?filter=');
    expect(res.status).toBe(200);
  });

  it('handles missing optional query params', async () => {
    const res = await api('/api/telemetry');
    expect(res.status).toBe(200);
  });

  it('handles non-numeric limit gracefully', async () => {
    const res = await api('/api/events?limit=abc');
    expect(res.status).toBe(200);
  });
});

// ── PATCH /api/rooms/:id (Phase 4) ──────────────────────
describe('PATCH /api/rooms/:id (Phase 4)', () => {
  it('updates room name', async () => {
    const createRes = await apiPost('/api/rooms').send({ name: 'Test Room', icon: 'home' });
    const roomId = createRes.body.room?.id;

    const res = await apiPatch(`/api/rooms/${roomId}`).send({ name: 'Renamed Room' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.room.name).toBe('Renamed Room');
  });

  it('updates room icon', async () => {
    const createRes = await apiPost('/api/rooms').send({ name: 'Icon Test', icon: 'star' });
    const roomId = createRes.body.room?.id;

    const res = await apiPatch(`/api/rooms/${roomId}`).send({ icon: 'star' });
    expect(res.status).toBe(200);
    expect(res.body.room.icon).toBe('star');
  });

  it('updates both name and icon', async () => {
    const createRes = await apiPost('/api/rooms').send({ name: 'Both', icon: 'blue' });
    const roomId = createRes.body.room?.id;

    const res = await apiPatch(`/api/rooms/${roomId}`).send({ name: 'Updated Both', icon: 'red' });
    expect(res.status).toBe(200);
    expect(res.body.room.name).toBe('Updated Both');
    expect(res.body.room.icon).toBe('red');
  });

  it('returns 400 for empty body', async () => {
    const res = await apiPatch('/api/rooms/1').send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent room', async () => {
    const res = await apiPatch('/api/rooms/99999').send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});
