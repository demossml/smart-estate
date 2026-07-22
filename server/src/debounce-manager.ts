// ── Debounce Manager ───────────────────────────────────────
// Design-doc-v2, раздел 5.
// Управляет debounce-таймерами для сценариев.
// pending хранится в памяти — при рестарте теряется (ожидаемое поведение).

import logger from './logger';

const MAX_PENDING = 1000;

interface PendingEntry {
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
}

export class DebounceManager {
  private pending = new Map<string, PendingEntry>();

  /**
   * Вызывается на шаге 2 pipeline evaluateTelemetry.
   * @returns true — продолжаем pipeline синхронно (debounce не нужен)
   *          false — pipeline прерван, ждём колбэк
   */
  onTelemetry(
    deviceIeee: string,
    property: string,
    value: number,
    scenarioId: number,
    triggerId: string,
    debounceMs: number,
    onConfirmed: (scenarioId: number, triggerId: string) => void,
  ): boolean {
    if (debounceMs <= 0) return true; // Нет debounce — продолжаем

    // Защита от утечки: максимум 1000 одновременных записей
    if (this.pending.size >= MAX_PENDING) {
      logger.warn("[DEBOUNCE] ", `⚠️ Pending limit reached (${MAX_PENDING}), rejecting new debounce registration`);
      return false;
    }

    const key = `${scenarioId}:${triggerId}`;

    // Если уже есть таймер для этого ключа — очищаем (перезапуск)
    const existing = this.pending.get(key);
    if (existing) {
      clearTimeout(existing.timer);
    }

    // Создаём новый таймер
    const timer = setTimeout(() => {
      this.pending.delete(key);
      // Запрашиваем ТЕКУЩЕЕ значение свойства из последней телеметрии
      // (не то, что было в момент создания таймера — design-doc 5.4)
      onConfirmed(scenarioId, triggerId);
    }, debounceMs);

    this.pending.set(key, { timer, startedAt: Date.now() });
    return false; // Сигнал pipeline'у: "не выполняй сейчас"
  }

  /**
   * Отменяет все таймеры (при рестарте сценариев).
   */
  cancelAll(): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
    }
    this.pending.clear();
    logger.log("[DEBOUNCE] ", '🗑️ All debounce timers cancelled');
  }

  get size(): number {
    return this.pending.size;
  }
}

// Singleton
export const debounceManager = new DebounceManager();
