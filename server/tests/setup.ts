/**
 * Shared test setup for smart-estate tests.
 * 
 * Usage:
 *   import { getApp, getRequest, getCsrf, cleanDb } from './setup';
 * 
 * Creates a fresh in-memory DB per test file.
 * Enables API_KEYS so CSRF auth is active.
 */

import { beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';

// Unique DB per test file — use a counter or import.meta.url hash
const TEST_DB_HASH = Math.random().toString(36).slice(2, 8);
const TEST_DB = `/tmp/smart-estate-${TEST_DB_HASH}.db`;

process.env.SMART_ESTATE_DB_PATH = TEST_DB;
process.env.API_KEYS = 'test-key-12345';
process.env.CSRF_SECRET = 'test-secret-2026-for-smart-estate';

const fs = require('fs');

// Track open DB handles for cleanup
const openDbs: Set<any> = new Set();

export function cleanTestDb(): void {
  try {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    if (fs.existsSync(TEST_DB + '.wal')) fs.unlinkSync(TEST_DB + '.wal');
    if (fs.existsSync(TEST_DB + '.shm')) fs.unlinkSync(TEST_DB + '.shm');
  } catch {
    // ignore race conditions
  }
}

export async function getApp(): Promise<any> {
  cleanTestDb();
  const mod = await import('../src/api');
  return mod.default;
}

export function getRequest(app: any) {
  return supertest.agent(app);
}

export async function getCsrf(request: any): Promise<{ token: string; cookie: string }> {
  const res = await request.get('/api/csrf-token').set('X-API-Key', 'test-key-12345');
  return {
    token: res.body.token || '',
    cookie: (res.headers['set-cookie'] || []).join(','),
  };
}

export function registerDb(db: any): void {
  openDbs.add(db);
}

export function closeDbs(): void {
  for (const db of openDbs) {
    try { db.close(); } catch { /* ignore */ }
  }
  openDbs.clear();
  cleanTestDb();
}

// ── Default fixtures ──

export async function createDevice(request: any, csrf: any, overrides = {}) {
  const res = await request
    .post('/api/devices')
    .set('X-CSRF-Token', csrf.token)
    .send({
      ieee_addr: '0xTEST001',
      friendly_name: 'Test Device',
      type: 'light',
      room_id: 1,
      ...overrides,
    });
  return res;
}
