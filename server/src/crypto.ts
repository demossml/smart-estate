import crypto from 'crypto';

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

// Set of used nonces with expiry (cleaned periodically)
const usedNonces = new Map<string, number>();

export function validateTimestamp(timestamp: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  return Math.abs(now - ts) <= MAX_REQUEST_AGE_S;
}

export function checkAndRecordNonce(nonce: string): boolean {
  const now = Date.now();
  // Clean expired nonces (older than 5 minutes)
  const toDelete: string[] = [];
  usedNonces.forEach((t, n) => {
    if (now - t > 300_000) toDelete.push(n);
  });
  toDelete.forEach(n => usedNonces.delete(n));

  if (usedNonces.has(nonce)) return false;
  usedNonces.set(nonce, now);
  return true;
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
