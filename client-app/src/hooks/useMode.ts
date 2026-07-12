import { useState, useEffect, useCallback } from 'react';
import { logClient } from '../lib/logger';
import { getApiKey } from '../api/client';

/**
 * Hook for demo/live mode toggle.
 * Reads current mode from API, provides toggle function.
 *
 * НАХОДКА (Модуль 8, при дочитывании Dashboard.tsx): это уже правильно
 * спроектированная, рабочая реализация переключения режима — использует
 * настоящие GET/POST /api/mode. Но, как и весь остальной фронтенд
 * (см. api/client.ts, Находка 1), не отправляла X-API-Key ни в одном из
 * двух fetch-вызовов — после фикса Модуля 1 (API_KEYS обязателен) оба
 * запроса получали бы 401. App.tsx при этом эту реализацию не использовал
 * вообще, а держал свою декоративную копию — теперь исправлено здесь и
 * App.tsx переключён на этот хук (см. PATCH_INSTRUCTIONS.md).
 */
export function useMode() {
  const [mode, setMode] = useState<'live' | 'demo'>('live');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/mode', { signal: controller.signal, headers: { 'X-API-Key': getApiKey() } })
      .then(r => {
        if (!r.ok) throw new Error(`mode API: ${r.status}`);
        return r.json();
      })
      .then(d => { if (d.ok) setMode(d.mode); })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        logClient('warn', 'Не удалось получить режим', error instanceof Error ? error.message : String(error));
      });
    return () => controller.abort();
  }, []);

  const toggle = useCallback(async () => {
    setLoading(true);
    const newMode = mode === 'demo' ? 'live' : 'demo';
    try {
      const res = await fetch('/api/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': getApiKey() },
        body: JSON.stringify({ mode: newMode }),
      });
      if (res.ok) setMode(newMode);
      else {
        const body = await res.json().catch(() => ({}));
        logClient('warn', 'Смена режима отклонена сервером', body?.error || String(res.status));
      }
    } catch (error) {
      logClient('error', 'Не удалось сменить режим', error instanceof Error ? error.message : String(error));
    }
    setLoading(false);
  }, [mode]);

  return { mode, toggle, loading };
}
