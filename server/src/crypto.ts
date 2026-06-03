import crypto from 'crypto';
import { stmt, query } from './db';

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
  if (!secret) return false;
  const expected = createSignature(body, nonce, timestamp, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
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
    // DuckDB prepared statements don't throw on duplicate PRIMARY KEY,
    // so we must check existence explicitly first.
    const existing = await query('SELECT 1 FROM used_nonces WHERE nonce = ?', nonce);
    if (existing.length > 0) return false;

    stmt.insertNonce.run(nonce);
    nonceCallCount++;
    // Clean expired nonces every ~10% of calls (probabilistic)
    if (nonceCallCount % 10 === 0) {
      await query(`DELETE FROM used_nonces WHERE expires_at < CURRENT_TIMESTAMP`);
    }
    return true;
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
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not set — skipping initData validation');
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
