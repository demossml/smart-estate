// ═══════════════════════════════════════════════════════════════
// Frontend Logger — ring buffer, captures errors + perf + UX
// ═══════════════════════════════════════════════════════════════

export type LogLevel = 'error' | 'warn' | 'info' | 'perf' | 'action';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  message: string;
  detail?: string;
  stack?: string;
}

const MAX_LOGS = 1000;
const logs: LogEntry[] = [];
let listeners: Array<() => void> = [];

function add(entry: LogEntry) {
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();
  // Also persist in sessionStorage for crash survival
  persist();
  // Notify listeners (React state)
  for (const fn of listeners) fn();
}

function persist() {
  try {
    sessionStorage.setItem('__hermes_debug_logs', JSON.stringify(logs.slice(-200)));
  } catch {/* quota exceeded — fine */}
}

function restoreInitial() {
  try {
    const raw = sessionStorage.getItem('__hermes_debug_logs');
    if (raw) {
      const parsed = JSON.parse(raw) as LogEntry[];
      if (Array.isArray(parsed)) {
        logs.push(...parsed);
      }
    }
  } catch {/* ignore */}
}

// ── Subscribe for React state ─────────────────────────────
export function onLog(fn: () => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter(f => f !== fn); };
}

export function getLogs(): readonly LogEntry[] {
  return logs;
}

export function clearLogs() {
  logs.length = 0;
  sessionStorage.removeItem('__hermes_debug_logs');
  for (const fn of listeners) fn();
}

// ── Wire up global error capture ──────────────────────────
export function initLogger() {
  restoreInitial();

  // Override console.error
  const origError = console.error.bind(console);
  console.error = (...args: any[]) => {
    origError(...args);
    const msg = args.map(a => (typeof a === 'string' ? a : a instanceof Error ? a.message : JSON.stringify(a))).join(' ');
    add({ ts: Date.now(), level: 'error', message: msg, stack: args.find(a => a instanceof Error)?.stack });
  };

  // Override console.warn
  const origWarn = console.warn.bind(console);
  console.warn = (...args: any[]) => {
    origWarn(...args);
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    add({ ts: Date.now(), level: 'warn', message: msg });
  };

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
    add({ ts: Date.now(), level: 'error', message: `Unhandled rejection: ${msg}`, stack: e.reason?.stack });
  });

  // Uncaught errors
  window.addEventListener('error', (e) => {
    add({ ts: Date.now(), level: 'error', message: `Global error: ${e.message}`, stack: e.error?.stack, detail: `${e.filename}:${e.lineno}:${e.colno}` });
  });

  // Long frames detection (jank)
  let lastFrame = performance.now();
  const detectJank = () => {
    const now = performance.now();
    const delta = now - lastFrame;
    lastFrame = now;
    if (delta > 100) {
      add({ ts: Date.now(), level: 'perf', message: `JANK: ${delta.toFixed(0)}ms frame`, detail: navigator.userAgent.slice(0, 60) });
    }
    requestAnimationFrame(detectJank);
  };
  requestAnimationFrame(detectJank);

  // Monitor fetch failures
  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const start = performance.now();
    try {
      const res = await origFetch(...args);
      const duration = (performance.now() - start).toFixed(0);
      if (!res.ok) {
        add({ ts: Date.now(), level: 'warn', message: `HTTP ${res.status} ${args[0]}`, detail: `${duration}ms` });
      }
      if (Number(duration) > 3000) {
        add({ ts: Date.now(), level: 'perf', message: `Slow fetch: ${args[0]}`, detail: `${duration}ms` });
      }
      return res;
    } catch (e: any) {
      add({ ts: Date.now(), level: 'error', message: `Fetch failed: ${args[0]}`, detail: e.message });
      throw e;
    }
  };

  // User interaction tracking (taps, scrolls)
  let lastTap = 0;
  document.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastTap > 500) {
      lastTap = now;
      add({ ts: now, level: 'action', message: 'Tap', detail: `${document.activeElement?.tagName || 'body'}` });
    }
  }, { passive: true });

  let scrollCount = 0;
  let scrollTimer = 0;
  document.addEventListener('scroll', () => {
    scrollCount++;
    if (scrollTimer) return;
    scrollTimer = window.setTimeout(() => {
      if (scrollCount > 20) {
        add({ ts: Date.now(), level: 'perf', message: `Scroll burst: ${scrollCount} events`, detail: `${window.scrollY}` });
      }
      scrollCount = 0;
      scrollTimer = 0;
    }, 1000);
  }, { passive: true });

  // Resize events
  let lastSize = `${window.innerWidth}x${window.innerHeight}`;
  window.addEventListener('resize', () => {
    const newSize = `${window.innerWidth}x${window.innerHeight}`;
    if (newSize !== lastSize) {
      lastSize = newSize;
      add({ ts: Date.now(), level: 'info', message: `Resize: ${newSize}`, detail: `DPR:${window.devicePixelRatio}` });
    }
  });

  // Log initial state
  add({ ts: Date.now(), level: 'info', message: `App started`, detail: `${window.innerWidth}x${window.innerHeight} DPR:${window.devicePixelRatio} ${navigator.userAgent.slice(0, 80)}` });
}

// ── Manual logging ────────────────────────────────────────
export function logInfo(msg: string, detail?: string) {
  add({ ts: Date.now(), level: 'info', message: msg, detail });
}

export function logAction(msg: string, detail?: string) {
  add({ ts: Date.now(), level: 'action', message: msg, detail });
}

// ── Send logs to server ───────────────────────────────────
export async function sendLogs(): Promise<{ ok: boolean; count: number }> {
  try {
    const res = await fetch('/api/client-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: logs.slice(-500), ua: navigator.userAgent, screen: `${window.innerWidth}x${window.innerHeight}`, dpr: window.devicePixelRatio }),
    });
    const data = await res.json();
    return { ok: data.ok, count: data.count ?? 0 };
  } catch (e: any) {
    return { ok: false, count: 0 };
  }
}
