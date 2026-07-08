import { query, logErrorWithLog, logScenarioExec } from './db';
import { executeActions, parseActions, ScenarioAction } from './actions';
import { parseTriggers, evaluateTriggers } from './triggers';
import logger from './logger';

// ── Schedule Types ───────────────────────────────────────

interface ScheduleConfig {
  type: 'sunset' | 'sunrise' | 'cron' | 'interval';
  value?: string;         // cron expression or "every 5m"
  offset_minutes?: number; // for sunset/sunrise: +30 or -30
}

interface ScheduledScenario {
  id: number;
  name: string;
  schedule: ScheduleConfig;
  actions: ScenarioAction[];
  has_triggers: boolean;
  triggers_json: string | null;
  last_fired: number;
}

// ── Scheduler State ──────────────────────────────────────

let scheduledScenarios: ScheduledScenario[] = [];
let tickInterval: ReturnType<typeof setInterval> | null = null;
let sunsetTime: Date | null = null;
let sunriseTime: Date | null = null;

// Default location: Moscow (можно переопределить через env)
const LAT = parseFloat(process.env.ESTATE_LAT || '55.7558');
const LON = parseFloat(process.env.ESTATE_LON || '37.6173');

// Sunset/sunrise check interval: каждые 60 секунд
const SUN_CHECK_MS = 60_000;
// Tick interval for cron: каждые 30 секунд
const TICK_MS = 30_000;

// ── Scheduler Lifecycle ──────────────────────────────────

export async function startScheduler(): Promise<void> {
  await reloadScheduledScenarios();
  updateSunTimes();

  // Every tick: check cron, interval, and sunset/sunrise
  tickInterval = setInterval(() => {
    schedulerTick().catch(e => logErrorWithLog(null, 'scheduler_error', e.message));
  }, TICK_MS);

  logger.log("[SCHEDULER] ", `⏰ Scheduler started (tick=${TICK_MS}ms, lat=${LAT}, lon=${LON})`);
}

export function stopScheduler(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  logger.log("[SCHEDULER] ", '⏰ Scheduler stopped');
}

export async function reloadScheduledScenarios(): Promise<void> {
  try {
    const rows = await query(
      `SELECT id, name, schedule_json, actions_json, triggers_json
       FROM scenarios WHERE active = true AND schedule_json IS NOT NULL
       ORDER BY id`
    );

    const newScenarios: ScheduledScenario[] = [];
    for (const row of rows) {
      try {
        const schedule: ScheduleConfig = JSON.parse(row.schedule_json);
        const actions = parseActions(row.actions_json);
        if (!actions || !schedule.type) {
          logErrorWithLog(null, 'scheduler_parse_error',
            `Invalid schedule or actions for #${row.id}`, row.name);
          continue;
        }

        const existing = scheduledScenarios.find(s => s.id === row.id);
        newScenarios.push({
          id: row.id,
          name: row.name,
          schedule,
          actions,
          has_triggers: !!(row.triggers_json),
          triggers_json: row.triggers_json,
          last_fired: existing?.last_fired ?? Date.now(),
        });
      } catch {
        logErrorWithLog(null, 'scheduler_parse_error',
          `Failed to parse schedule for #${row.id}`, row.name);
      }
    }

    scheduledScenarios = newScenarios;
    updateSunTimes();
    logger.log("[SCHEDULER] ", `⏰ Scheduler reloaded: ${scheduledScenarios.length} time-triggered scenarios`);
  } catch (e: any) {
    logErrorWithLog(null, 'scheduler_reload_error', e.message);
  }
}

// ── Tick Handler ─────────────────────────────────────────

async function schedulerTick(): Promise<void> {
  const now = Date.now();

  // Update sun times once per hour
  const currentHour = new Date().getHours();
  if (currentHour === 0 && new Date().getMinutes() < 1) {
    updateSunTimes();
  }

  for (const sc of scheduledScenarios) {
    try {
      const shouldFire = await shouldFireNow(sc, now);
      if (shouldFire) {
        logger.log("[SCHEDULER] ", `⏰ [schedule #${sc.id}] ${sc.name} — ${sc.schedule.type}`);

        // If scenario also has telemetry triggers, evaluate them
        if (sc.has_triggers && sc.triggers_json) {
          const triggers = parseTriggers(sc.triggers_json);
          if (triggers && triggers.conditions.length > 0) {
            // Build telemetry map from latest values
            const map = new Map<string, number>();
            await enrichTelemetryForConditions(map, triggers.conditions);

            const result = evaluateTriggers(triggers, map);
            if (!result.matched) {
              logger.log("[SCHEDULER] ", `⏰ [schedule #${sc.id}] ${sc.name} — time matched but telemetry conditions not met, skipping`);
              continue;
            }
          }
        }

        // Fire actions
        const execResult = await executeActions(sc.actions, sc.name);
        logScenarioExec(
          sc.id,
          `schedule:${sc.schedule.type}${sc.schedule.value ? ':' + sc.schedule.value : ''}`,
          execResult.fired,
          execResult.errors.length === 0,
          execResult.errors.length > 0 ? execResult.errors.join('; ') : undefined
        );

        sc.last_fired = now;
      }
    } catch (e: any) {
      logErrorWithLog(null, 'scheduler_fire_error', e.message, `scenario #${sc.id}`);
    }
  }
}

// ── Should Fire Logic ────────────────────────────────────

async function shouldFireNow(sc: ScheduledScenario, now: number): Promise<boolean> {
  switch (sc.schedule.type) {
    case 'cron':
      return shouldFireCron(sc, now);
    case 'sunset':
      return shouldFireSunEvent(sc, now, 'sunset');
    case 'sunrise':
      return shouldFireSunEvent(sc, now, 'sunrise');
    case 'interval':
      return shouldFireInterval(sc, now);
    default:
      return false;
  }
}

// ── Cron Evaluator ───────────────────────────────────────

function shouldFireCron(sc: ScheduledScenario, now: number): boolean {
  const expr = sc.schedule.value;
  if (!expr) return false;

  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const nowDate = new Date(now);
  const fields = {
    minute: nowDate.getMinutes(),
    hour: nowDate.getHours(),
    day: nowDate.getDate(),
    month: nowDate.getMonth() + 1,
    dayOfWeek: nowDate.getDay(),
  };

  const cronFields = [
    { value: fields.minute, cron: parts[0], name: 'minute' },
    { value: fields.hour, cron: parts[1], name: 'hour' },
    { value: fields.day, cron: parts[2], name: 'day' },
    { value: fields.month, cron: parts[3], name: 'month' },
    { value: fields.dayOfWeek, cron: parts[4], name: 'dayOfWeek' },
  ];

  for (const f of cronFields) {
    if (!cronMatch(f.value, f.cron)) return false;
  }

  // Check cooldown: only fire once per minute window
  const lastMinute = new Date(sc.last_fired).getMinutes();
  const lastHour = new Date(sc.last_fired).getHours();
  if (lastMinute === fields.minute && lastHour === fields.hour &&
      sc.last_fired > now - 60_000) {
    return false;
  }

  return true;
}

function cronMatch(value: number, pattern: string): boolean {
  if (pattern === '*') return true;

  // Handle comma-separated: "1,3,5"
  if (pattern.includes(',')) {
    return pattern.split(',').some(p => cronMatch(value, p.trim()));
  }

  // Handle range: "1-5"
  if (pattern.includes('-')) {
    const [low, high] = pattern.split('-').map(Number);
    return value >= low && value <= high;
  }

  // Handle step: "*/5"
  if (pattern.includes('*/')) {
    const step = parseInt(pattern.split('*/')[1]);
    return value % step === 0;
  }

  // Exact match
  return parseInt(pattern) === value;
}

// ── Sunset/Sunrise Evaluator ─────────────────────────────

function shouldFireSunEvent(sc: ScheduledScenario, now: number, event: 'sunset' | 'sunrise'): boolean {
  const targetTime = event === 'sunset' ? sunsetTime : sunriseTime;
  if (!targetTime) return false;

  const offsetMs = (sc.schedule.offset_minutes || 0) * 60_000;
  const fireTime = targetTime.getTime() + offsetMs;

  // Fire window: +/- 30 seconds around target
  const windowMs = TICK_MS + 5_000;
  if (now >= fireTime - windowMs && now <= fireTime + windowMs) {
    // Already fired today?
    const fireDate = new Date(fireTime);
    const lastDate = new Date(sc.last_fired);
    if (lastDate.toDateString() === fireDate.toDateString()) return false;
    return true;
  }

  return false;
}

// ── Interval Evaluator ───────────────────────────────────

function shouldFireInterval(sc: ScheduledScenario, now: number): boolean {
  const value = sc.schedule.value;
  if (!value) return false;

  // Parse "every Xm" or "every Xh"
  const match = value.match(/^every\s+(\d+)\s*(m|min|h|hour)s?$/i);
  if (!match) return false;

  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  let intervalMs: number;
  if (unit === 'h' || unit === 'hour') {
    intervalMs = amount * 60 * 60 * 1000;
  } else {
    intervalMs = amount * 60 * 1000;
  }

  return (now - sc.last_fired) >= intervalMs;
}

// ── Sun Position Calculation ─────────────────────────────

function updateSunTimes(): void {
  try {
    // Use suncalc if available, otherwise estimate
    const suncalc = require('suncalc');
    const today = new Date();
    const times = suncalc.getTimes(today, LAT, LON);
    sunsetTime = times.sunset;
    sunriseTime = times.sunrise;

    if (sunsetTime && sunriseTime) {
      logger.log("[SCHEDULER] ", `🌅 Sunrise: ${sunriseTime.toLocaleTimeString('ru-RU')} | Sunset: ${sunsetTime.toLocaleTimeString('ru-RU')}`);
    }
  } catch {
    // Fallback: rough estimate for Moscow
    const now = new Date();
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
    const declination = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
    const latRad = LAT * Math.PI / 180;
    const declRad = declination * Math.PI / 180;
    const hourAngle = Math.acos(-Math.tan(latRad) * Math.tan(declRad));
    const solarNoon = 12 - (LON / 15);
    const daylightHours = (2 * hourAngle * 180 / Math.PI) / 15;

    const sunriseHour = solarNoon - daylightHours / 2;
    const sunsetHour = solarNoon + daylightHours / 2;

    const today = new Date();
    sunriseTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(),
      Math.floor(sunriseHour), Math.round((sunriseHour % 1) * 60));
    sunsetTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(),
      Math.floor(sunsetHour), Math.round((sunsetHour % 1) * 60));
  }
}

// ── Telemetry Enrichment for Combined Triggers ────────────

async function enrichTelemetryForConditions(
  map: Map<string, number>,
  conditions: Array<{ device: string; property: string; operator: string; value: number }>
): Promise<void> {
  const needed = new Set<string>();
  for (const cond of conditions) {
    needed.add(`${cond.device}:${cond.property}`);
  }

  await Promise.all(
    Array.from(needed).map(async (key) => {
      const [device, property] = key.split(':');
      try {
        const rows = await query(
          `SELECT value FROM telemetry WHERE device_ieee = ? AND property = ?
           ORDER BY ts DESC LIMIT 1`,
          device, property
        );
        if (rows.length > 0) map.set(key, rows[0].value);
      } catch {}
    })
  );
}
