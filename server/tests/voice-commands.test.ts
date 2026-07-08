import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';

const TEST_DB = '/tmp/smart-estate-voice-test.db';
process.env.SMART_ESTATE_DB_PATH = TEST_DB;
process.env.PORT = '18799';

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

describe('POST /api/voice', () => {
  it('recognizes включи свет as unknown device (empty DB)', async () => {
    const res = await request
      .post('/api/voice')
      .send({ text: 'включи свет' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('action');
  });

  it('recognizes какая температура', async () => {
    const res = await request
      .post('/api/voice')
      .send({ text: 'какая температура в гостиной' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('action');
  });

  it('returns 400 for empty text', async () => {
    const res = await request
      .post('/api/voice')
      .send({ text: '' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('returns 400 for missing text', async () => {
    const res = await request
      .post('/api/voice')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('handles unknown command gracefully', async () => {
    const res = await request
      .post('/api/voice')
      .send({ text: 'сделай что-то невероятно сложное и непонятное' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.action).toContain('Не понял');
  });

  it('handles открой/закрой gates', async () => {
    const res = await request
      .post('/api/voice')
      .send({ text: 'открой ворота' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('action');
  });

  it('handles запусти сценарий', async () => {
    const res = await request
      .post('/api/voice')
      .send({ text: 'запусти сценарий утреннее пробуждение' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('action');
  });

  it('handles что с устройством', async () => {
    const res = await request
      .post('/api/voice')
      .send({ text: 'что с датчиком' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('action');
  });
});

describe('GET /api/voice/pending-actions', () => {
  it('returns empty list initially', async () => {
    const res = await request.get('/api/voice/pending-actions');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.actions)).toBe(true);
  });
});

describe('POST /api/voice/pending-actions/:id/confirm', () => {
  it('returns 404 for nonexistent action (voice excluded from CSRF)', async () => {
    const res = await request
      .post('/api/voice/pending-actions/test/confirm')
      .send({});
    // Voice endpoints исключены из CSRF, но несуществующий action → 404
    expect(res.status).toBe(404);
  });
});

describe('POST /api/voice/pending-actions/:id/dismiss', () => {
  it('returns 404 for nonexistent action (voice excluded from CSRF)', async () => {
    const res = await request
      .post('/api/voice/pending-actions/nonexistent/dismiss')
      .send({});
    expect(res.status).toBe(404);
  });
});

describe('GET /api/voice/suggestions', () => {
  it('returns empty list initially', async () => {
    const res = await request.get('/api/voice/suggestions');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
  });
});

describe('POST /api/voice/suggestions/:id/accept', () => {
  it('returns 404 for nonexistent suggestion (voice excluded from CSRF)', async () => {
    const res = await request
      .post('/api/voice/suggestions/nonexistent/accept')
      .send({});
    expect(res.status).toBe(404);
  });
});
