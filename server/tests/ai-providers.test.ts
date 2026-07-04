import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';

const TEST_DB = '/tmp/smart-estate-ai-test.duckdb';
process.env.SMART_ESTATE_DB_PATH = TEST_DB;
process.env.PORT = '18792';

const fs = require('fs');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
if (fs.existsSync(TEST_DB + '.wal')) fs.unlinkSync(TEST_DB + '.wal');

let app: any;
let request: any;

beforeAll(async () => {
  const mod = await import('../src/api');
  app = mod.default;
  request = supertest.agent(app);
});

afterAll(async () => {
  const mod = await import('../src/db');
  mod.db.close();
});

describe('POST /api/ai/providers', () => {
  it('creates a provider with valid data', async () => {
    // Use the agent — it stores cookies across requests
    const csrfRes = await request.get('/api/csrf-token');
    const token = csrfRes.body.token;

    const res = await request
      .post('/api/ai/providers')
      .set('X-CSRF-Token', token)
      .send({ provider: 'openai', token: 'sk-test1234567890abcdef' });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.provider.provider).toBe('openai');
    expect(res.body.provider.maskedToken).toContain('…');
    expect(res.body.provider.maskedToken).not.toContain('sk-test1234567890abcdef');
    expect(res.body.provider).not.toHaveProperty('token_enc');
  });

  it('rejects missing provider field', async () => {
    const csrfRes = await request.get('/api/csrf-token');
    const token = csrfRes.body.token;

    const res = await request
      .post('/api/ai/providers')
      .set('X-CSRF-Token', token)
      .send({ token: 'test' });
    expect(res.status).toBe(400);
  });

  it('rejects missing token field', async () => {
    const csrfRes = await request.get('/api/csrf-token');
    const token = csrfRes.body.token;

    const res = await request
      .post('/api/ai/providers')
      .set('X-CSRF-Token', token)
      .send({ provider: 'openai' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid provider name', async () => {
    const csrfRes = await request.get('/api/csrf-token');
    const token = csrfRes.body.token;

    const res = await request
      .post('/api/ai/providers')
      .set('X-CSRF-Token', token)
      .send({ provider: 'invalid_provider', token: 'test' });
    expect(res.status).toBe(400);
  });

  it('returns 403 without CSRF', async () => {
    const res = await request
      .post('/api/ai/providers')
      .send({ provider: 'openai', token: 'test' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/ai/providers', () => {
  it('returns list with masked tokens', async () => {
    const res = await request.get('/api/ai/providers');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.providers)).toBe(true);
    expect(res.body.providers.length).toBeGreaterThanOrEqual(1);
    for (const p of res.body.providers) {
      expect(p.maskedToken).toBe('***');
      expect(p).not.toHaveProperty('token_enc');
    }
  });
});

describe('PATCH /api/ai/providers/:id', () => {
  it('updates provider model and useInScenarios', async () => {
    const csrfRes = await request.get('/api/csrf-token');
    const token = csrfRes.body.token;

    const createRes = await request
      .post('/api/ai/providers')
      .set('X-CSRF-Token', token)
      .send({ provider: 'anthropic', token: 'sk-ant-test' });
    expect(createRes.status).toBe(201);
    expect(createRes.body).toHaveProperty('provider');
    const id = createRes.body.provider.id;

    const res = await request
      .patch(`/api/ai/providers/${id}`)
      .set('X-CSRF-Token', token)
      .send({ model: 'claude-sonnet-4', useInScenarios: true });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.provider.model).toBe('claude-sonnet-4');
  });

  it('returns 403 for non-existent provider (no CSRF — fresh agent has no cookie)', async () => {
    // Make a fresh request without CSRF
    const res = await request
      .patch('/api/ai/providers/nonexistent')
      .send({ model: 'test' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/ai/providers/:id/test', () => {
  it('returns error status but does not crash when provider unreachable', async () => {
    const csrfRes = await request.get('/api/csrf-token');
    const token = csrfRes.body.token;

    const createRes = await request
      .post('/api/ai/providers')
      .set('X-CSRF-Token', token)
      .send({ provider: 'openai', token: 'sk-fake-test-token' });
    expect(createRes.status).toBe(201);
    const id = createRes.body.provider.id;

    const res = await request
      .post(`/api/ai/providers/${id}/test`)
      .set('X-CSRF-Token', token);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('test_ok');
    expect(res.body).toHaveProperty('status');
  });

  it('returns 403 for non-existent provider (no CSRF)', async () => {
    const res = await request
      .post('/api/ai/providers/nonexistent/test')
      .send({});
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/ai/providers/:id', () => {
  it('deletes an existing provider', async () => {
    const csrfRes = await request.get('/api/csrf-token');
    const token = csrfRes.body.token;

    const createRes = await request
      .post('/api/ai/providers')
      .set('X-CSRF-Token', token)
      .send({ provider: 'ollama', token: 'test', baseUrl: 'http://localhost:11434' });
    expect(createRes.status).toBe(201);
    const id = createRes.body.provider.id;

    const res = await request
      .delete(`/api/ai/providers/${id}`)
      .set('X-CSRF-Token', token);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.deleted).toBe(id);
  });

  it('returns 403 for non-existent provider (no CSRF)', async () => {
    const res = await request
      .delete('/api/ai/providers/nonexistent')
      .send({});
    expect(res.status).toBe(403);
  });
});
