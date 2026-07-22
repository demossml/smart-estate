// ── Override Manager ───────────────────────────────────────
// Design-doc-v2, раздел 6.
// Управляет manual_overrides для устройств.

import { query, logErrorWithLog } from './db';
import logger from './logger';

const DEFAULT_TTL_MINUTES = 30;

/**
 * Создаёт или обновляет manual_override для устройства.
 * Вызывается при прямой команде пользователя (НЕ через сценарий).
 */
export async function createManualOverride(
  deviceIeee: string,
  command: string,
  source: string = 'manual',
  ttlMinutes: number = DEFAULT_TTL_MINUTES
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    await query(
      `INSERT INTO manual_overrides (device_ieee, command, source, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(device_ieee) DO UPDATE SET
         command = excluded.command,
         source = excluded.source,
         expires_at = excluded.expires_at`,
      deviceIeee, command, source, expiresAt
    );
    logger.log("[OVERRIDE] ", `🔒 Manual override: ${deviceIeee} → ${command} (${ttlMinutes}min)`);
  } catch (e: any) {
    logErrorWithLog(deviceIeee, 'manual_override_error', e.message);
  }
}

/**
 * Проверяет, есть ли активный manual_override для устройства.
 */
export async function hasActiveOverride(deviceIeee: string): Promise<boolean> {
  try {
    const rows = await query(
      `SELECT id FROM manual_overrides WHERE device_ieee = ? AND expires_at > datetime('now') LIMIT 1`,
      deviceIeee
    );
    return (rows as any[]).length > 0;
  } catch {
    return false;
  }
}

/**
 * Возвращает активный manual_override для устройства, если есть.
 */
export async function getActiveOverride(deviceIeee: string): Promise<{ command: string; source: string; expires_at: string } | null> {
  try {
    const rows = await query(
      `SELECT command, source, expires_at FROM manual_overrides
       WHERE device_ieee = ? AND expires_at > datetime('now') LIMIT 1`,
      deviceIeee
    );
    return rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

/**
 * Очистка истёкших override'ов (периодическая).
 */
export async function cleanExpiredOverrides(): Promise<void> {
  try {
    const result = await query(
      `DELETE FROM manual_overrides WHERE expires_at <= datetime('now')`
    );
    logger.log("[OVERRIDE] ", `🧹 Cleaned expired overrides`);
  } catch (e: any) {
    logErrorWithLog(null, 'override_cleanup_error', e.message);
  }
}

/**
 * Таблица приоритетов (константа, design-doc раздел 6):
 * 1 = Безопасность — переопределяет override всегда
 * 2 = Аварийная защита — переопределяет override
 * 3 = Энергоэффективность — уважает override
 * 4 = Комфорт — уважает override
 * 5 = Декоративные — уважает override
 */
export function overrideBypassesPriority(priorityLevel: number): boolean {
  return priorityLevel <= 2;
}
