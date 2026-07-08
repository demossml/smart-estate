import crypto from 'crypto';
import { stmt, query, logErrorWithLog } from './db';
import logger from './logger';

// ── HMAC Signature ───────────────────────────────────────

/**
 * Create HMAC-SHA256 signature for request verification.
 * Format: base64(HMAC-SHA256(body + ':' + nonce + ':' + timestamp, secret))
 */
export function createSignature(body: string, nonce: string, timestamp: string, secret: string): string {
  const payload = `${body}:${nonce}:${timestamp}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

export function verifySignature(body: string, nonce: string, timestamp: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  const expected = createSignature(body, nonce, timestamp, secret);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

// ── Nonce/Timestamp Validation ───────────────────────────

// Max age of a request in seconds (prevents replay attacks)
const MAX_REQUEST_AGE_S = 30;

// Counter for periodic cleanup (every ~10% of calls)
let nonceCallCount = 0;

export function validateTimestamp(timestamp: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  return Math.abs(now - ts) <= MAX_REQUEST_AGE_S;
}

export async function checkAndRecordNonce(nonce: string): Promise<boolean> {
  try {
    const info = stmt.insertNonce.run(nonce);
    nonceCallCount++;
    // Clean expired nonces every ~10% of calls (probabilistic)
    if (nonceCallCount % 10 === 0) {
      await query(`DELETE FROM used_nonces WHERE expires_at < CURRENT_TIMESTAMP`);
    }
    return info.changes > 0; // 0 changes = nonce already existed (OR IGNORE) → replay
  } catch (err: any) {
    // Return false on any DB error (safety-first)
    return false;
  }
}

// ── Telegram initData Validation ─────────────────────────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

/**
 * Validate Telegram WebApp initData signature.
 * Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramInitData(initData: string): boolean {
  if (!BOT_TOKEN) {
    logger.warn("[CRYPTO] ", '⚠️ TELEGRAM_BOT_TOKEN not set — skipping initData validation');
    return false;
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return false;

    // Remove hash, sort alphabetically
    params.delete('hash');
    const pairs: string[] = [];
    params.forEach((value, key) => {
      pairs.push(`${key}=${value}`);
    });
    pairs.sort();

    const dataCheckString = pairs.join('\n');

    // Compute secret key: HMAC-SHA256 of "WebAppData" with bot token
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    // Compute hash of data_check_string with secret key
    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    return computedHash === hash;
  } catch {
    return false;
  }
}

// ── API Key Hashing ──────────────────────────────────────

/**
 * Hash an API key with SHA-256 and return first 16 hex chars.
 * Used for audit logging so raw keys never appear in logs.
 */
export function hashApiKey(apiKey: string): string {
  if (!apiKey) return 'empty';
  const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
  return hash.slice(0, 16);
}

// ── API Key Validation ───────────────────────────────────

export function validateApiKey(key: string): boolean {
  if (!key) return false;
  const keys = (process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
  if (!keys.length) return true; // No keys configured = allow all
  return keys.includes(key);
}

// ── Security Audit ───────────────────────────────────────

export interface SecurityEvent {
  type: 'auth_success' | 'auth_failed' | 'replay_blocked' | 'invalid_initdata' | 'rate_limit';
  ip: string;
  detail: string;
}

const auditHandlers: Array<(e: SecurityEvent) => void> = [];

export function onSecurityEvent(handler: (e: SecurityEvent) => void): void {
  auditHandlers.push(handler);
}

export function logSecurityEvent(event: SecurityEvent): void {
  for (const handler of auditHandlers) {
    try { handler(event); } catch {}
  }
}

// ── AES-256-GCM Token Encryption ─────────────────────────

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '';

export function encryptToken(plaintext: string): string {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY должен быть задан и содержать 64 hex-символа (32 байта)');
  }
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(encoded: string): string {
  const [ivHex, authTagHex, dataHex] = encoded.split(':');
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
