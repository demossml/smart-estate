import { Request, Response, NextFunction } from 'express';
import {
  verifySignature,
  validateTimestamp,
  checkAndRecordNonce,
  validateTelegramInitData,
  validateApiKey,
  logSecurityEvent,
} from '../crypto';

// ── Auth Middleware ──────────────────────────────────────

/**
 * Multi-layer authentication:
 * 1. API Key (X-API-Key header) — for service-to-service
 * 2. Telegram initData — for Mini App frontend
 * 3. HMAC signature — anti-tamper for internal requests
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  // Layer 1: API Key
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey && validateApiKey(apiKey)) {
    logSecurityEvent({ type: 'auth_success', ip, detail: `api_key:${apiKey.slice(0, 8)}...` });
    return next();
  }

  // Layer 2: Telegram initData (for Mini App)
  const initData = (req.headers['x-telegram-initdata'] as string) ||
                   (req.query.initData as string) ||
                   (req.body?.initData as string);

  if (initData && validateTelegramInitData(initData)) {
    logSecurityEvent({ type: 'auth_success', ip, detail: 'initData_valid' });
    return next();
  }

  // Layer 3: HMAC signature (for internal services with shared secret)
  const signature = req.headers['x-signature'] as string;
  const timestamp = req.headers['x-timestamp'] as string;
  const nonce = req.headers['x-nonce'] as string;

  if (signature && timestamp && nonce) {
    if (!validateTimestamp(timestamp)) {
      logSecurityEvent({ type: 'replay_blocked', ip, detail: `expired_timestamp:${timestamp}` });
      res.status(401).json({ ok: false, error: 'Request expired' });
      return;
    }

    if (!checkAndRecordNonce(nonce)) {
      logSecurityEvent({ type: 'replay_blocked', ip, detail: `duplicate_nonce:${nonce}` });
      res.status(401).json({ ok: false, error: 'Duplicate nonce' });
      return;
    }

    const secret = process.env.HMAC_SECRET || '';
    const body = JSON.stringify(req.body || {});
    if (verifySignature(body, nonce, timestamp, signature, secret)) {
      logSecurityEvent({ type: 'auth_success', ip, detail: 'hmac_valid' });
      return next();
    }
  }

  // All auth methods failed
  logSecurityEvent({ type: 'auth_failed', ip, detail: req.path });
  res.status(401).json({ ok: false, error: 'Unauthorized' });
}

// ── Optional Auth (doesn't block, just enriches request) ──

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  // Tag the request with auth source if available
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey && validateApiKey(apiKey)) {
    (req as any).authSource = 'api_key';
  } else if (req.query.initData || req.body?.initData) {
    (req as any).authSource = 'telegram';
  }
  next();
}
