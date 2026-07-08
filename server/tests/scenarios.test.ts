import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { getApp, getRequest, getCsrf, cleanTestDb } from './setup';

// PORT — уникальный, чтобы файлы не конфликтовали при параллельном запуске
process.env.PORT = '18791';

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

function apiPut(url: string) {
  const r = request.put(url).set('X-API-Key', 'test-key-12345');
  if (csrfToken) r.set('X-CSRF-Token', csrfToken);
  if (csrfCookie) r.set('Cookie', csrfCookie);
  return r;
}

function apiDel(url: string) {
  const r = request.delete(url).set('X-API-Key', 'test-key-12345');
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

const SAMPLE_TRIGGERS = JSON.stringify({
  logic: 'ANY',
  conditions: [{ device: 'test_sensor', property: 'temperature', operator: '>', value: 30 }],
});

const SAMPLE_ACTIONS = JSON.stringify([
  { type: 'notify', message: '⚠️ Temperature > 30°C!' },
  { type: 'mqtt', device: 'fan_relay', command: 'ON' },
]);

describe('POST /api/scenarios', () => {
  it('creates a new scenario', async () => {
    const res = await apiPost('/api/scenarios')
      .send({
        name: 'Test Scenario',
        description: 'A test scenario',
        triggers_json: SAMPLE_TRIGGERS,
        actions_json: SAMPLE_ACTIONS,
      });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.scenario.name).toBe('Test Scenario');
    expect(res.body.scenario.active).toBe(1);
  });

  it('returns 400 when required fields missing', async () => {
    const res = await apiPost('/api/scenarios')
      .send({ name: 'No triggers' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('creates scenario with explicit active=false', async () => {
    const res = await apiPost('/api/scenarios')
      .send({
        name: 'Inactive Scenario',
        triggers_json: SAMPLE_TRIGGERS,
        actions_json: SAMPLE_ACTIONS,
        active: false,
      });
    expect(res.body.scenario.active).toBe(0);
  });
});

describe('PUT /api/scenarios/:id', () => {
  it('updates scenario name and description', async () => {
    const res = await apiPut('/api/scenarios/1')
      .send({
        name: 'Updated Ventilation',
        description: 'Updated description',
      });
    expect(res.status).toBe(200);
    expect(res.body.scenario.name).toBe('Updated Ventilation');
    expect(res.body.scenario.description).toBe('Updated description');
  });

  it('updates triggers and actions', async () => {
    const res = await apiPut('/api/scenarios/1')
      .send({
        triggers_json: SAMPLE_TRIGGERS,
        actions_json: SAMPLE_ACTIONS,
      });
    expect(res.status).toBe(200);
    expect(res.body.scenario.triggers_json).toBe(SAMPLE_TRIGGERS);
    expect(res.body.scenario.actions_json).toBe(SAMPLE_ACTIONS);
  });

  it('returns 404 for unknown scenario', async () => {
    const res = await apiPut('/api/scenarios/999')
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/scenarios/:id', () => {
  it('deletes a scenario', async () => {
    // Create first
    const create = await apiPost('/api/scenarios')
      .send({
        name: 'To Delete',
        triggers_json: SAMPLE_TRIGGERS,
        actions_json: SAMPLE_ACTIONS,
      });
    const id = create.body.scenario.id;

    const res = await apiDel(`/api/scenarios/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(String(id));

    // Verify gone
    const check = await api(`/api/scenarios/${id}/executions`);
    expect(check.body.executions.length).toBe(0);
  });

  it('returns 404 for unknown scenario', async () => {
    const res = await apiDel('/api/scenarios/999');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/scenarios/:id/executions', () => {
  it('returns empty executions for scenario with no history', async () => {
    const res = await api('/api/scenarios/1/executions');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.executions.length).toBe(0);
    expect(res.body.count).toBe(0);
  });

  it('respects limit parameter', async () => {
    const res = await api('/api/scenarios/1/executions?limit=10');
    expect(res.status).toBe(200);
  });
});
