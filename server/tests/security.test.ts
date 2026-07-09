import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';

// ── Crypto Unit Tests ────────────────────────────────────

import {
  createSignature,
  verifySignature,
  validateTimestamp,
  checkAndRecordNonce,
  validateTelegramInitData,
  validateApiKey,
} from '../src/crypto';

describe('HMAC Signatures', () => {
  const secret = 'test-secret-key-12345';

  it('creates and verifies signature', () => {
    const sig = createSignature('{"test":1}', 'nonce123', '1717000000', secret);
    expect(verifySignature('{"test":1}', 'nonce123', '1717000000', sig, secret)).toBe(true);
  });

  it('rejects wrong secret', () => {
    const sig = createSignature('body', 'nonce', '1717000000', secret);
    expect(verifySignature('body', 'nonce', '1717000000', sig, 'wrong-secret')).toBe(false);
  });

  it('rejects tampered body', () => {
    const sig = createSignature('original', 'nonce', '1717000000', secret);
    expect(verifySignature('tampered', 'nonce', '1717000000', sig, secret)).toBe(false);
  });

  it('rejects tampered nonce', () => {
    const sig = createSignature('body', 'nonce-A', '1717000000', secret);
    expect(verifySignature('body', 'nonce-B', '1717000000', sig, secret)).toBe(false);
  });

  it('rejects tampered timestamp', () => {
    const sig = createSignature('body', 'nonce', '1717000000', secret);
    expect(verifySignature('body', 'nonce', '1717000001', sig, secret)).toBe(false);
  });

  it('returns false when secret is empty', () => {
    expect(verifySignature('body', 'nonce', '1717000000', 'any-sig', '')).toBe(false);
  });

  it('different payloads produce different signatures', () => {
    const sig1 = createSignature('payload1', 'n1', '1000', secret);
    const sig2 = createSignature('payload2', 'n1', '1000', secret);
    expect(sig1).not.toBe(sig2);
  });
});

describe('Timestamp Validation', () => {
  it('accepts current timestamp', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(validateTimestamp(String(now))).toBe(true);
  });

  it('accepts timestamp within 30 seconds', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(validateTimestamp(String(now - 25))).toBe(true);
    expect(validateTimestamp(String(now + 25))).toBe(true);
  });

  it('rejects timestamp older than 30 seconds', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(validateTimestamp(String(now - 31))).toBe(false);
    expect(validateTimestamp(String(now + 31))).toBe(false);
  });

  it('rejects invalid timestamp', () => {
    expect(validateTimestamp('not-a-number')).toBe(false);
    expect(validateTimestamp('')).toBe(false);
  });
});

describe('Nonce Tracking', () => {
  it('accepts new nonce', async () => {
    expect(await checkAndRecordNonce('fresh-nonce-' + Date.now())).toBe(true);
  });

  it('rejects duplicate nonce', async () => {
    const nonce = 'dup-nonce-' + Date.now();
    expect(await checkAndRecordNonce(nonce)).toBe(true);
    expect(await checkAndRecordNonce(nonce)).toBe(false);
  });

  it('accepts different nonces', async () => {
    expect(await checkAndRecordNonce('nonce-A-' + Date.now())).toBe(true);
    expect(await checkAndRecordNonce('nonce-B-' + Date.now())).toBe(true);
    expect(await checkAndRecordNonce('nonce-C-' + Date.now())).toBe(true);
  });
});

describe('API Key Validation', () => {
  const originalKeys = process.env.API_KEYS;

  afterAll(() => {
    if (originalKeys) process.env.API_KEYS = originalKeys;
    else delete process.env.API_KEYS;
  });

  it('returns false when no keys configured (fail-closed)', () => {
    delete process.env.API_KEYS;
    // Без API_KEYS validateApiKey теперь fail-closed: отклоняет любой ключ
    expect(validateApiKey('anything')).toBe(false);
  });

  it('validates against configured keys', () => {
    process.env.API_KEYS = 'key1,key2,key3';
    expect(validateApiKey('key1')).toBe(true);
    expect(validateApiKey('key3')).toBe(true);
    expect(validateApiKey('wrong')).toBe(false);
  });

  it('handles empty key', () => {
    process.env.API_KEYS = 'key1';
    expect(validateApiKey('')).toBe(false);
  });
});

// ── API Security Tests ───────────────────────────────────

const TEST_DB = '/tmp/smart-estate-sec-test.db';
process.env.SMART_ESTATE_DB_PATH = TEST_DB;
process.env.API_KEYS = 'test-key-secure-123';
process.env.PORT = '18788';

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
  delete process.env.API_KEYS;
});

describe('API Authentication', () => {
  it('rejects request without auth', async () => {
    const res = await request.get('/api/status');
    expect(res.status).toBe(401);
  });

  it('accepts request with valid API key', async () => {
    const res = await request
      .get('/api/status')
      .set('X-API-Key', 'test-key-secure-123');
    expect(res.status).toBe(200);
  });

  it('rejects invalid API key', async () => {
    const res = await request
      .get('/api/status')
      .set('X-API-Key', 'wrong-key');
    expect(res.status).toBe(401);
  });
});

describe('API Security Headers', () => {
  it('has security headers from Helmet', async () => {
    const res = await request
      .get('/api/status')
      .set('X-API-Key', 'test-key-secure-123');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('has CORS headers', async () => {
    const res = await request
      .get('/api/status')
      .set('X-API-Key', 'test-key-secure-123')
      .set('Origin', 'https://t.me');
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('rejects disallowed CORS origin', async () => {
    const res = await request
      .get('/api/status')
      .set('X-API-Key', 'test-key-secure-123')
      .set('Origin', 'https://evil.com');
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.com');
  });
});

describe('API — Unauthorized commands blocked', () => {
  it('blocks device ON without auth', async () => {
    const res = await request.post('/api/devices/0xTEST/on');
    expect(res.status).toBe(401);
  });

  it('blocks gate open without auth', async () => {
    const res = await request.post('/api/gates/0xGATE/open');
    expect(res.status).toBe(401);
  });

  it('blocks scenario toggle without auth', async () => {
    const res = await request.post('/api/scenarios/1/toggle');
    expect(res.status).toBe(401);
  });

  it('blocks group all-off without auth', async () => {
    const res = await request.post('/api/groups/1/all-off');
    expect(res.status).toBe(401);
  });
});

describe('API — Authorized commands work', () => {
  let csrfToken: string;

  beforeAll(async () => {
    const mod = await import('../src/db');
    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,type,room_id)
      VALUES ('0xSEC001','secure_light','light',1) ON CONFLICT DO NOTHING`);
    
    // Get CSRF token with auth
    const tokenRes = await request
      .get('/api/csrf-token')
      .set('X-API-Key', 'test-key-secure-123');
    csrfToken = tokenRes.body.token;
  });

  it('allows device ON with auth', async () => {
    const res = await request
      .post('/api/devices/0xSEC001/on')
      .set('X-API-Key', 'test-key-secure-123');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('allows gate open with auth', async () => {
    const res = await request
      .post('/api/gates/0xSEC001/open')
      .set('X-API-Key', 'test-key-secure-123');
    expect(res.status).toBe(200);
  });
});

// ── WebSocket Auth Tests ──────────────────────────────────

import http from 'http';

describe('WebSocket Auth', () => {
  let server: http.Server;
  let port: number;
  let wsDbPath: string;

  beforeAll(async () => {
    const { WebSocket } = await import('ws');
    (globalThis as any).WebSocket = WebSocket;
    
    wsDbPath = '/tmp/smart-estate-ws-test.db';
    process.env.SMART_ESTATE_DB_PATH = wsDbPath;
    process.env.SMART_ESTATE_MODE = 'demo';
    port = 18796;
    
    const mod = await import('../src/index');
    server = mod.default;
    
    await new Promise<void>((resolve) => {
      server.listen(port, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.SMART_ESTATE_MODE;
    const fs = require('fs');
    if (fs.existsSync(wsDbPath)) fs.unlinkSync(wsDbPath);
    if (fs.existsSync(wsDbPath + '.wal')) fs.unlinkSync(wsDbPath + '.wal');
  });

  it('rejects WebSocket without auth headers', async () => {
    const { WebSocket } = await import('ws');
    
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    
    await expect(
      new Promise((resolve, reject) => {
        ws.on('open', () => reject(new Error('Connected without auth!')));
        ws.on('error', () => {});
        ws.on('unexpected-response', (_req, res) => {
          expect(res.statusCode).toBe(401);
          resolve(true);
        });
        setTimeout(() => reject(new Error('Timeout WS1')), 5000);
      })
    ).resolves.toBe(true);
    
    ws.close();
  });

  it('accepts WebSocket with valid X-API-Key', async () => {
    const { WebSocket } = await import('ws');
    process.env.API_KEYS = 'test-ws-key';
    
    const ws = new WebSocket(`ws://localhost:${port}/ws`, {
      headers: { 'X-API-Key': 'test-ws-key' }
    });
    
    await expect(
      new Promise((resolve, reject) => {
        ws.on('open', () => resolve('connected'));
        ws.on('error', (err) => reject(err));
        setTimeout(() => reject(new Error('Timeout WS2')), 5000);
      })
    ).resolves.toBe('connected');
    
    ws.close();
    delete process.env.API_KEYS;
  });
});
