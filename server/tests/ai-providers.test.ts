import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, getRequest, cleanTestDb } from './setup';

// PORT — уникальный, чтобы файлы не конфликтовали при параллельном запуске
process.env.PORT = '18797';

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

function apiPatch(url: string) {
  const r = request.patch(url).set('X-API-Key', 'test-key-12345');
  return r;
}

function apiDel(url: string) {
  const r = request.delete(url).set('X-API-Key', 'test-key-12345');
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

describe('POST /api/ai/providers', () => {
  it('creates a provider with valid data', async () => {
    const res = await apiPost('/api/ai/providers')
      .send({ provider: 'openai', token: 'sk-test1234567890abcdef' });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.provider.provider).toBe('openai');
    expect(res.body.provider.maskedToken).toContain('…');
    expect(res.body.provider.maskedToken).not.toContain('sk-test1234567890abcdef');
    expect(res.body.provider).not.toHaveProperty('token_enc');
  });

  it('rejects missing provider field', async () => {
    const res = await apiPost('/api/ai/providers')
      .send({ token: 'test' });
    expect(res.status).toBe(400);
  });

  it('rejects missing token field', async () => {
    const res = await apiPost('/api/ai/providers')
      .send({ provider: 'openai' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid provider name', async () => {
    const res = await apiPost('/api/ai/providers')
      .send({ provider: 'not_a_real_provider', token: 'test' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/ai/providers/:id', () => {
  let providerId: string;

  beforeAll(async () => {
    const create = await apiPost('/api/ai/providers')
      .send({ provider: 'openai', token: 'sk-test-patch' });
    providerId = create.body.provider.id;
  });

  it('updates provider model and useInScenarios', async () => {
    const res = await apiPatch(`/api/ai/providers/${providerId}`)
      .send({ model: 'gpt-4', useInScenarios: true });
    expect(res.status).toBe(200);
    expect(res.body.provider.model).toBe('gpt-4');
    expect(res.body.provider.use_in_scenarios).toBe(1);
  });
});

describe('POST /api/ai/providers/:id/test', () => {
  let providerId: string;

  beforeAll(async () => {
    const create = await apiPost('/api/ai/providers')
      .send({ provider: 'openai', token: 'sk-test-test-route' });
    providerId = create.body.provider.id;
  });

  it('returns error status but does not crash when provider unreachable', async () => {
    const res = await apiPost(`/api/ai/providers/${providerId}/test`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(['connected', 'error']).toContain(res.body.status);
  });
});

describe('DELETE /api/ai/providers/:id', () => {
  let providerId: string;

  beforeAll(async () => {
    const create = await apiPost('/api/ai/providers')
      .send({ provider: 'openai', token: 'sk-test-delete' });
    providerId = create.body.provider.id;
  });

  it('deletes an existing provider', async () => {
    const res = await apiDel(`/api/ai/providers/${providerId}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const list = await api('/api/ai/providers');
    expect(list.body.providers.find((p: any) => p.id === providerId)).toBeUndefined();
  });
});
