import { Request, Response, NextFunction } from 'express';
import {
  verifySignature,
  validateTimestamp,
  checkAndRecordNonce,
  validateApiKey,
  hashApiKey,
  logSecurityEvent,
} from '../crypto';

// ── Auth Middleware ──────────────────────────────────────

/**
 * Multi-layer authentication:
 * 1. API Key (X-API-Key header) — primary auth
 * 2. HMAC signature — anti-tamper for internal requests
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  // Layer 1: API Key
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey && validateApiKey(apiKey)) {
    logSecurityEvent({ type: 'auth_success', ip, detail: `api_key_hash:${hashApiKey(apiKey)}` });
    return next();
  }

  // Layer 2: HMAC signature (for internal services with shared secret)
  const signature = req.headers['x-signature'] as string;
  const timestamp = req.headers['x-timestamp'] as string;
  const nonce = req.headers['x-nonce'] as string;

  if (signature && timestamp && nonce) {
    if (!validateTimestamp(timestamp)) {
      logSecurityEvent({ type: 'replay_blocked', ip, detail: `expired_timestamp:${timestamp}` });
      res.status(401).json({ ok: false, error: 'Request expired' });
      return;
    }

    if (!(await checkAndRecordNonce(nonce))) {
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
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey && validateApiKey(apiKey)) {
    (req as any).authSource = 'api_key';
  }
  next();
}
