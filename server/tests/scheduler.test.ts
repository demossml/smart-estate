import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Test the cron matching and schedule parsing logic
// These are unit tests that don't need DB

const TEST_DB = '/tmp/smart-estate-scheduler-test.duckdb';
process.env.SMART_ESTATE_DB_PATH = TEST_DB;

const fs = require('fs');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
if (fs.existsSync(TEST_DB + '.wal')) fs.unlinkSync(TEST_DB + '.wal');

// ── Cron Matching (replicated from scheduler.ts for unit tests) ──

function cronMatch(value: number, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.includes(',')) {
    return pattern.split(',').some(p => cronMatch(value, p.trim()));
  }
  if (pattern.includes('-')) {
    const [low, high] = pattern.split('-').map(Number);
    return value >= low && value <= high;
  }
  if (pattern.includes('*/')) {
    const step = parseInt(pattern.split('*/')[1]);
    return value % step === 0;
  }
  return parseInt(pattern) === value;
}

function shouldFireCronExpr(minute: number, hour: number, day: number, month: number, dayOfWeek: number, expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const fields = [
    { value: minute, cron: parts[0] },
    { value: hour, cron: parts[1] },
    { value: day, cron: parts[2] },
    { value: month, cron: parts[3] },
    { value: dayOfWeek, cron: parts[4] },
  ];

  return fields.every(f => cronMatch(f.value, f.cron));
}

// ── Interval Parsing ──
function parseIntervalMs(value: string): number | null {
  const match = value.match(/^every\s+(\d+)\s*(m|min|h|hour)s?$/i);
  if (!match) return null;
  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'h' || unit === 'hour') return amount * 60 * 60 * 1000;
  return amount * 60 * 1000;
}

describe('Cron Expression Matching', () => {
  it('wildcard matches any value', () => {
    expect(cronMatch(0, '*')).toBe(true);
    expect(cronMatch(30, '*')).toBe(true);
    expect(cronMatch(59, '*')).toBe(true);
  });

  it('exact match', () => {
    expect(cronMatch(0, '0')).toBe(true);
    expect(cronMatch(0, '1')).toBe(false);
    expect(cronMatch(6, '6')).toBe(true);
  });

  it('comma-separated values', () => {
    expect(cronMatch(0, '0,30')).toBe(true);
    expect(cronMatch(30, '0,30')).toBe(true);
    expect(cronMatch(15, '0,30')).toBe(false);
  });

  it('range values', () => {
    expect(cronMatch(3, '1-5')).toBe(true);
    expect(cronMatch(1, '1-5')).toBe(true);
    expect(cronMatch(5, '1-5')).toBe(true);
    expect(cronMatch(6, '1-5')).toBe(false);
    expect(cronMatch(0, '1-5')).toBe(false);
  });

  it('step values (*/N)', () => {
    expect(cronMatch(0, '*/15')).toBe(true);
    expect(cronMatch(15, '*/15')).toBe(true);
    expect(cronMatch(30, '*/15')).toBe(true);
    expect(cronMatch(45, '*/15')).toBe(true);
    expect(cronMatch(5, '*/15')).toBe(false);
    expect(cronMatch(10, '*/15')).toBe(false);
  });

  it('full cron expressions', () => {
    // "0 6 * * *" — every day at 06:00
    expect(shouldFireCronExpr(0, 6, 1, 1, 1, '0 6 * * *')).toBe(true);
    expect(shouldFireCronExpr(1, 6, 1, 1, 1, '0 6 * * *')).toBe(false);
    expect(shouldFireCronExpr(0, 7, 1, 1, 1, '0 6 * * *')).toBe(false);
  });

  it('"0 23 * * *" — every day at 23:00', () => {
    expect(shouldFireCronExpr(0, 23, 15, 6, 3, '0 23 * * *')).toBe(true);
    expect(shouldFireCronExpr(0, 22, 15, 6, 3, '0 23 * * *')).toBe(false);
  });

  it('"0 7 * * *" — every day at 07:00', () => {
    expect(shouldFireCronExpr(0, 7, 1, 1, 0, '0 7 * * *')).toBe(true);
  });

  it('*/5 * * * * — every 5 minutes', () => {
    expect(shouldFireCronExpr(0, 0, 1, 1, 0, '*/5 * * * *')).toBe(true);
    expect(shouldFireCronExpr(5, 0, 1, 1, 0, '*/5 * * * *')).toBe(true);
    expect(shouldFireCronExpr(1, 0, 1, 1, 0, '*/5 * * * *')).toBe(false);
  });

  it('invalid expression returns false', () => {
    expect(shouldFireCronExpr(0, 0, 1, 1, 1, 'invalid')).toBe(false);
    expect(shouldFireCronExpr(0, 0, 1, 1, 1, '0 6 *')).toBe(false);
  });
});

describe('Interval Parsing', () => {
  it('parses "every 5m"', () => {
    expect(parseIntervalMs('every 5m')).toBe(5 * 60 * 1000);
  });

  it('parses "every 30min"', () => {
    expect(parseIntervalMs('every 30min')).toBe(30 * 60 * 1000);
  });

  it('parses "every 1h"', () => {
    expect(parseIntervalMs('every 1h')).toBe(60 * 60 * 1000);
  });

  it('parses "every 2hours"', () => {
    expect(parseIntervalMs('every 2hours')).toBe(2 * 60 * 60 * 1000);
  });

  it('returns null for invalid input', () => {
    expect(parseIntervalMs('invalid')).toBeNull();
    expect(parseIntervalMs('every')).toBeNull();
    expect(parseIntervalMs('')).toBeNull();
  });
});

describe('Schedule Scenarios in DB', () => {
  let mod: any;

  beforeAll(async () => {
    mod = await import('../src/db');
  });

  it('has scenarios with schedule_json', async () => {
    const rows = await mod.query(
      "SELECT * FROM scenarios WHERE schedule_json IS NOT NULL ORDER BY id"
    );
    expect(rows.length).toBeGreaterThanOrEqual(3);
    // Scenario 2: sunset
    const s2 = rows.find((r: any) => r.id === 2);
    expect(s2).toBeDefined();
    expect(JSON.parse(s2.schedule_json).type).toBe('sunset');
    // Scenario 9: cron 23:00
    const s9 = rows.find((r: any) => r.id === 9);
    expect(s9).toBeDefined();
    expect(JSON.parse(s9.schedule_json).value).toBe('0 23 * * *');
  });
});

describe('Schedule CRUD via API', () => {
  let mod2: any;

  beforeAll(async () => {
    mod2 = await import('../src/db');
  });

  it('updates schedule_json on a scenario', async () => {
    await mod2.query(
      "UPDATE scenarios SET schedule_json = ? WHERE id = 2",
      '{"type":"sunset","offset_minutes":-45}'
    );
    const s = await mod2.query("SELECT * FROM scenarios WHERE id = 2");
    const schedule = JSON.parse(s[0].schedule_json);
    expect(schedule.offset_minutes).toBe(-45);
  });

  it('clears schedule_json', async () => {
    await mod2.query("UPDATE scenarios SET schedule_json = NULL WHERE id = 2");
    const s = await mod2.query("SELECT * FROM scenarios WHERE id = 2");
    expect(s[0].schedule_json).toBeNull();
    await mod2.query(
      "UPDATE scenarios SET schedule_json = ? WHERE id = 2",
      '{"type":"sunset","offset_minutes":-30}'
    );
  });
});
