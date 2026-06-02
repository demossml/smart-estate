export type LogLevel = 'error' | 'warn' | 'info';

export interface ClientLog {
  id: string;
  level: LogLevel;
  message: string;
  ts: string;
  details?: string;
}

const STORAGE_KEY = 'smart-estate-client-logs';
const listeners = new Set<(logs: ClientLog[]) => void>();

function readLogs(): ClientLog[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]') as ClientLog[];
  } catch {
    return [];
  }
}

function writeLogs(logs: ClientLog[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-80)));
  listeners.forEach(listener => listener(readLogs()));
}

export function getLogs() {
  return readLogs();
}

export function clearLogs() {
  writeLogs([]);
}

export function subscribeLogs(listener: (logs: ClientLog[]) => void) {
  listeners.add(listener);
  listener(readLogs());
  return () => {
    listeners.delete(listener);
  };
}

export function logClient(level: LogLevel, message: string, details?: string) {
  const logs = readLogs();
  logs.push({
    id: `${Date.now()}-${Math.round(Math.random() * 10000)}`,
    level,
    message,
    details,
    ts: new Date().toISOString(),
  });
  writeLogs(logs);
}

export function installClientLogger() {
  window.addEventListener('error', event => {
    logClient('error', event.message, event.filename ? `${event.filename}:${event.lineno}` : undefined);
  });

  window.addEventListener('unhandledrejection', event => {
    logClient('error', 'Unhandled promise rejection', String(event.reason));
  });

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const started = performance.now();
    try {
      const response = await originalFetch(...args);
      const duration = performance.now() - started;
      if (duration > 3000) {
        logClient('warn', `Slow fetch: ${String(args[0])}`, `${Math.round(duration)} ms`);
      }
      return response;
    } catch (error) {
      logClient('error', `Fetch failed: ${String(args[0])}`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  };

  let lastFrame = performance.now();
  const watchFrame = (now: number) => {
    const delta = now - lastFrame;
    if (delta > 100) {
      logClient('warn', 'Long frame detected', `${Math.round(delta)} ms`);
    }
    lastFrame = now;
    requestAnimationFrame(watchFrame);
  };
  requestAnimationFrame(watchFrame);
}
