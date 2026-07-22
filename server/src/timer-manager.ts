// ── Timer Manager for scenario "timer" triggers ────────────
// Хранит таймеры в памяти. При рестарте сервера теряются — это ожидаемо.
//
// Timer trigger формат: { type: "timer", after_event: "trigger_id", duration_ms: 600000 }
// Срабатывает через duration_ms ПОСЛЕ того, как сработал указанный триггер в том же сценарии.
// В первой версии — только внутри одного сценария (кросс-сценарные ссылки отложены).

import logger from './logger';

interface TimerEntry {
  timer: ReturnType<typeof setTimeout>;
  scenarioId: number;
  triggerId: string;
  durationMs: number;
  createdAt: number;
}

class TimerManager {
  private timers = new Map<string, TimerEntry>();
  private onFire: (scenarioId: number, triggerId: string) => void;

  constructor(onFire: (scenarioId: number, triggerId: string) => void) {
    this.onFire = onFire;
  }

  /**
   * Регистрирует timer trigger для сценария после срабатывания базового триггера.
   */
  register(scenarioId: number, triggerId: string, durationMs: number): void {
    const key = `${scenarioId}:${triggerId}`;

    // Если уже есть таймер для этой пары — сбросить (restart)
    this.cancel(key);

    const timer = setTimeout(() => {
      this.timers.delete(key);
      logger.log("[TIMER] ", `⏰ Timer fired: scenario #${scenarioId}, trigger=${triggerId}`);
      this.onFire(scenarioId, triggerId);
    }, durationMs);

    this.timers.set(key, { timer, scenarioId, triggerId, durationMs, createdAt: Date.now() });
    logger.log("[TIMER] ", `⏰ Timer registered: scenario #${scenarioId}, trigger=${triggerId}, ${durationMs}ms`);
  }

  /**
   * Отменяет таймер (при повторном срабатывании базового триггера).
   */
  cancel(key: string): void {
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      this.timers.delete(key);
      logger.log("[TIMER] ", `⏰ Timer cancelled: ${key}`);
    }
  }

  /**
   * Отменяет все таймеры (при рестарте сценариев).
   */
  cancelAll(): void {
    for (const [key, entry] of this.timers) {
      clearTimeout(entry.timer);
    }
    this.timers.clear();
    logger.log("[TIMER] ", '⏰ All timers cancelled');
  }

  /**
   * Количество активных таймеров.
   */
  get size(): number {
    return this.timers.size;
  }
}

export const timerManager = new TimerManager((scenarioId, triggerId) => {
  // При срабатывании timer trigger — запускаем сценарий
  const { evaluateTimerTrigger } = require('./engine');
  evaluateTimerTrigger(scenarioId, triggerId).catch((e: any) =>
    logger.error("[TIMER] ", `Timer fire error: ${e.message}`)
  );
});
