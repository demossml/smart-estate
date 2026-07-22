import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// NOTE: import crypto functions dynamically AFTER env vars are set
// because crypto.ts reads TOKEN_ENCRYPTION_KEY at module level
const TEST_DB = '/tmp/smart-estate-crypto-test.db';
process.env.SMART_ESTATE_DB_PATH = TEST_DB;
process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex

const fs = require('fs');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
if (fs.existsSync(TEST_DB + '.wal')) fs.unlinkSync(TEST_DB + '.wal');

let createSignature: Function;
let verifySignature: Function;
let validateTimestamp: Function;
let checkAndRecordNonce: Function;
let validateTelegramInitData: Function;
let validateApiKey: Function;
let hashApiKey: Function;
let encryptToken: Function;
let decryptToken: Function;
let logSecurityEvent: Function;
let onSecurityEvent: Function;

beforeAll(async () => {
  const mod = await import('../src/crypto');
  createSignature = mod.createSignature;
  verifySignature = mod.verifySignature;
  validateTimestamp = mod.validateTimestamp;
  checkAndRecordNonce = mod.checkAndRecordNonce;
  validateTelegramInitData = mod.validateTelegramInitData;
  validateApiKey = mod.validateApiKey;
  hashApiKey = mod.hashApiKey;
  encryptToken = mod.encryptToken;
  decryptToken = mod.decryptToken;
  logSecurityEvent = mod.logSecurityEvent;
  onSecurityEvent = mod.onSecurityEvent;
});

describe('HMAC Signatures', () => {
  const secret = 'test-hmac-secret-32byt!!';
  const body = '{"device":"0xABC","command":"ON"}';
  const nonce = 'abc123';
  const ts = String(Math.floor(Date.now() / 1000));

  it('creates and verifies signature', () => {
    const sig = createSignature(body, nonce, ts, secret);
    expect(sig).toBeTruthy();
    expect(verifySignature(body, nonce, ts, sig, secret)).toBe(true);
  });

  it('rejects wrong secret', () => {
    const sig = createSignature(body, nonce, ts, secret);
    expect(verifySignature(body, nonce, ts, sig, 'wrong-secret')).toBe(false);
  });

  it('rejects tampered body', () => {
    const sig = createSignature(body, nonce, ts, secret);
    expect(verifySignature('{"device":"hacked"}', nonce, ts, sig, secret)).toBe(false);
  });

  it('rejects different nonce', () => {
    const sig = createSignature(body, nonce, ts, secret);
    expect(verifySignature(body, 'different-nonce', ts, sig, secret)).toBe(false);
  });

  it('rejects different timestamp', () => {
    const sig = createSignature(body, nonce, ts, secret);
    expect(verifySignature(body, nonce, '0', sig, secret)).toBe(false);
  });

  it('returns false when secret is empty', () => {
    const sig = createSignature(body, nonce, ts, secret);
    expect(verifySignature(body, nonce, ts, sig, '')).toBe(false);
    expect(verifySignature(body, nonce, ts, '', '')).toBe(false);
  });

  it('different payloads produce different signatures', () => {
    const sig1 = createSignature('a', nonce, ts, secret);
    const sig2 = createSignature('b', nonce, ts, secret);
    expect(sig1).not.toBe(sig2);
  });
});

describe('Timestamp Validation', () => {
  it('accepts current timestamp', () => {
    expect(validateTimestamp(String(Math.floor(Date.now() / 1000)))).toBe(true);
  });

  it('accepts timestamp within 30 seconds', () => {
    const near = String(Math.floor(Date.now() / 1000) - 25);
    expect(validateTimestamp(near)).toBe(true);
  });

  it('rejects timestamp older than 30 seconds', () => {
    const old = String(Math.floor(Date.now() / 1000) - 60);
    expect(validateTimestamp(old)).toBe(false);
  });

  it('rejects timestamp in the future beyond 30s', () => {
    const future = String(Math.floor(Date.now() / 1000) + 60);
    expect(validateTimestamp(future)).toBe(false);
  });

  it('rejects invalid timestamp', () => {
    expect(validateTimestamp('not-a-number')).toBe(false);
    expect(validateTimestamp('')).toBe(false);
    expect(validateTimestamp('abc123')).toBe(false);
  });
});

describe('Nonce Tracking', () => {
  beforeAll(async () => {
    // Ensure used_nonces table exists via full db init
    await import('../src/db');
    const { query } = await import('../src/db');
    // Clean slate
    try { await query('DELETE FROM used_nonces'); } catch {}
  });

  it('accepts new nonce', async () => {
    const result = await checkAndRecordNonce('nonce-1');
    expect(result).toBe(true);
  });

  it('rejects duplicate nonce', async () => {
    const result = await checkAndRecordNonce('nonce-1');
    expect(result).toBe(false);
  });

  it('accepts different nonces', async () => {
    expect(await checkAndRecordNonce('nonce-2')).toBe(true);
    expect(await checkAndRecordNonce('nonce-3')).toBe(true);
    expect(await checkAndRecordNonce('nonce-4')).toBe(true);
  });
});

describe('Telegram initData Validation', () => {
  it('returns false when TELEGRAM_BOT_TOKEN is not set', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(validateTelegramInitData('query_id=123&hash=abc')).toBe(false);
  });

  it('returns false for malformed data', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    expect(validateTelegramInitData('')).toBe(false);
    expect(validateTelegramInitData('no-hash-here')).toBe(false);
  });
});

describe('API Key Validation', () => {
  const origKeys = process.env.API_KEYS;

  afterAll(() => {
    process.env.API_KEYS = origKeys;
  });

  it('returns false for empty key', () => {
    process.env.API_KEYS = 'test-key';
    expect(validateApiKey('')).toBe(false);
    expect(validateApiKey('')).toBe(false);
  });

  it('validates against configured keys', () => {
    process.env.API_KEYS = 'key1,key2';
    expect(validateApiKey('key1')).toBe(true);
    expect(validateApiKey('key2')).toBe(true);
    expect(validateApiKey('key3')).toBe(false);
  });

  it('returns false when no keys configured (fail-closed)', () => {
    delete process.env.API_KEYS;
    // validateApiKey теперь fail-closed: без API_KEYS доступ запрещён
    expect(validateApiKey('anything')).toBe(false);
  });

  it('handles whitespace in key list', () => {
    process.env.API_KEYS = ' key1 , key2 ';
    expect(validateApiKey('key1')).toBe(true);
    expect(validateApiKey('key2')).toBe(true);
  });
});

describe('API Key Hashing', () => {
  it('hashes API key to first 16 hex chars', () => {
    const hash = hashApiKey('my-secret-key');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns "empty" for empty key', () => {
    expect(hashApiKey('')).toBe('empty');
    expect(hashApiKey(' ').length).toBe(16);
  });

  it('produces consistent hash for same key', () => {
    const h1 = hashApiKey('test-key');
    const h2 = hashApiKey('test-key');
    expect(h1).toBe(h2);
  });

  it('produces different hash for different keys', () => {
    const h1 = hashApiKey('key-a');
    const h2 = hashApiKey('key-b');
    expect(h1).not.toBe(h2);
  });
});

describe('Token Encryption (AES-256-GCM)', () => {
  it('encrypts and decrypts a token', () => {
    const token = 'sk-test-token-12345';
    const encrypted = encryptToken(token);
    expect(encrypted).toContain(':'); // iv:authTag:ciphertext
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(token);
  });

  it('produces different ciphertext each time for same plaintext', () => {
    const token = 'sk-constant';
    const e1 = encryptToken(token);
    const e2 = encryptToken(token);
    expect(e1).not.toBe(e2); // random IV
    // But both decrypt to same
    expect(decryptToken(e1)).toBe(token);
    expect(decryptToken(e2)).toBe(token);
  });

  it('encrypts empty string', () => {
    const encrypted = encryptToken('');
    expect(encrypted).toContain(':');
    expect(decryptToken(encrypted)).toBe('');
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptToken('secret-token');
    const parts = encrypted.split(':');
    // Tamper auth tag
    const tampered = [parts[0], '00'.repeat(16), parts[2]].join(':');
    expect(() => decryptToken(tampered)).toThrow();
  });
});

describe('Security Audit Events', () => {
  it('notifies handlers on security event', () => {
    const events: any[] = [];
    onSecurityEvent((e: any) => events.push(e));
    logSecurityEvent({ type: 'auth_success', ip: '127.0.0.1', detail: 'test' });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('auth_success');
    expect(events[0].ip).toBe('127.0.0.1');
  });

  it('does not crash when handler throws', () => {
    onSecurityEvent(() => { throw new Error('handler error'); });
    expect(() => logSecurityEvent({ type: 'rate_limit', ip: '::1', detail: 'burst' })).not.toThrow();
  });
});
