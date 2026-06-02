import { useState, useEffect, useCallback } from 'react';
import { logClient } from '../lib/logger';

/**
 * Hook for demo/live mode toggle.
 * Reads current mode from API, provides toggle function.
 */
export function useMode() {
  const [mode, setMode] = useState<'live' | 'demo'>('live');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/mode', { signal: controller.signal })
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      });
      if (res.ok) setMode(newMode);
    } catch (error) {
      logClient('error', 'Не удалось сменить режим', error instanceof Error ? error.message : String(error));
    }
    setLoading(false);
  }, [mode]);

  return { mode, toggle, loading };
}
