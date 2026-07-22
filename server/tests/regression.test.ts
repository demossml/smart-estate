import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, getRequest, cleanTestDb } from './setup';

process.env.PORT = '18796';
cleanTestDb();

let app: any;
let request: any;


function api(url: string) {
  return request.get(url).set('X-API-Key', 'test-key-12345');
}

function apiPost(url: string) {
  return request.post(url).set('X-API-Key', 'test-key-12345');
}

function apiPut(url: string) {
  return request.put(url).set('X-API-Key', 'test-key-12345');
}

function apiPatch(url: string) {
  return request.patch(url).set('X-API-Key', 'test-key-12345');
}

function apiDelete(url: string) {
  return request.delete(url).set('X-API-Key', 'test-key-12345');
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

// ═══════════════════════════════════════════════════════
// БАГ #1: POST /api/devices → должен возвращать 201, а не 200
// ═══════════════════════════════════════════════════════
describe('[REGRESSION] POST /api/devices — статус 201', () => {
  it('создание устройства должно возвращать 201 Created', async () => {
    const res = await apiPost('/api/devices').send({
      ieee_addr: '0xREG001',
      friendly_name: 'regression_test',
      type: 'switch',
      room_id: 1,
    });
    expect(res.status).toBe(201); // сейчас 200 — баг
    expect(res.body.ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// БАГ #2: POST /api/rooms → должен возвращать 201, а не 200
// ═══════════════════════════════════════════════════════
describe('[REGRESSION] POST /api/rooms — статус 201', () => {
  it('создание комнаты должно возвращать 201 Created', async () => {
    const res = await apiPost('/api/rooms').send({
      name: 'regression_room',
      icon: 'test',
    });
    expect(res.status).toBe(201); // сейчас 200 — баг
    expect(res.body.ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// БАГ #3: GET /api/rooms/:id/devices с несуществующей комнатой → 404
// ═══════════════════════════════════════════════════════
describe('[REGRESSION] GET /api/rooms/:id/devices — 404 для несуществующей', () => {
  it('должен возвращать 404 для несуществующей комнаты', async () => {
    const res = await api('/api/rooms/99999/devices');
    expect(res.status).toBe(404); // сейчас 200 с пустым массивом — баг
  });
});

// ═══════════════════════════════════════════════════════
// БАГ #4: GET /api/climate → ключ 'rooms', а не 'setpoints'
// ═══════════════════════════════════════════════════════
describe('[REGRESSION] GET /api/climate — ключ "rooms"', () => {
  it('должен возвращать поле rooms', async () => {
    const res = await api('/api/climate');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.rooms).toBeDefined(); // сейчас setpoints — баг
  });
});

// ═══════════════════════════════════════════════════════
// БАГ #5: GET /api/csrf-token не должен падать с 500
// ═══════════════════════════════════════════════════════
describe('[REGRESSION] GET /api/csrf-token — не 500', () => {
  it('должен возвращать токен, не 500', async () => {
    const res = await request
      .get('/api/csrf-token')
      .set('X-API-Key', 'test-key-12345');
    // Сейчас 500 если CSRF_SECRET не задан — должен быть graceful fallback
    expect(res.status).not.toBe(500);
  });
});

// ═══════════════════════════════════════════════════════
// БАГ #6: GET /api/discovery/events — не должен падать с require('./db')
// ═══════════════════════════════════════════════════════
// SSE тестируется через supertest — он вернёт 200 + headers
// (require('./db') заменён на stmt.getDiscoveryEvents.db)
describe('[REGRESSION] GET /api/discovery/events — SSE без require', () => {
  it('SSE endpoint не должен падать с 500', { timeout: 5000 }, async () => {
    const res = await api('/api/discovery/events');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
    // В ответе должно быть SSE data с existing событиями
    expect(res.text).toContain('existing');
  });
});

// ═══════════════════════════════════════════════════════
// БАГ #7 (code): toggleDemoDevice — write-операции без await
// ═══════════════════════════════════════════════════════
describe('[REGRESSION] toggleDemoDevice — синхронность записи', () => {
  it('state_changes должны быть записаны синхронно (с await)', async () => {
    const demoMod = await import('../src/demo');
    const dbMod = await import('../src/db');

    // Seed demo data first
    await demoMod.seedDemoData();

    // Toggle
    await demoMod.toggleDemoDevice('demo:living_light', 'ON');

    // Баг: toggleDemoDevice не ждёт logStateChange и query(),
    // поэтому запись может не успеть.
    // После фикса этот тест должен находить запись
    const sc = await dbMod.query(
      "SELECT * FROM state_changes WHERE device_ieee = 'demo:living_light' ORDER BY ts DESC LIMIT 1"
    );
    expect(sc.length).toBeGreaterThanOrEqual(1);
    expect(sc[0].new_state).toBe('ON');
  });
});
