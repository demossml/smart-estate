import { useState, useEffect, useMemo } from 'react';
import { getLogs, clearLogs, sendLogs, onLog, type LogEntry } from './logger';
import { Bug, Send, Trash2, X, AlertTriangle, AlertCircle, Info, Zap, MousePointerClick } from 'lucide-react';

const LEVEL_ICON: Record<string, typeof Bug> = {
  error: AlertCircle,
  warn: AlertTriangle,
  info: Info,
  perf: Zap,
  action: MousePointerClick,
};

const LEVEL_COLOR: Record<string, string> = {
  error: 'text-red-400',
  warn: 'text-yellow-400',
  info: 'text-blue-400',
  perf: 'text-purple-400',
  action: 'text-emerald-400',
};

const LEVEL_BG: Record<string, string> = {
  error: 'bg-red-500/10 border-red-500/20',
  warn: 'bg-yellow-500/10 border-yellow-500/20',
  info: 'bg-blue-500/10 border-blue-500/20',
  perf: 'bg-purple-500/10 border-purple-500/20',
  action: 'bg-emerald-500/10 border-emerald-500/20',
};

export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    setLogs(getLogs().slice());
    return onLog(() => setLogs(getLogs().slice()));
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return logs;
    return logs.filter(l => l.level === filter);
  }, [logs, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: logs.length };
    for (const l of logs) {
      c[l.level] = (c[l.level] || 0) + 1;
    }
    return c;
  }, [logs]);

  // Triple-tap header to toggle
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const handleSend = async () => {
    setSending(true);
    const result = await sendLogs();
    setSentOk(result.ok);
    setSending(false);
    setTimeout(() => setSentOk(null), 3000);
  };

  const errorCount = counts.error || 0;
  const warnCount = counts.warn || 0;

  return (
    <>
      {/* Floating debug button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 w-10 h-10 bg-[#161B22]/90 backdrop-blur border border-[rgba(255,255,255,0.1)] rounded-full flex items-center justify-center active:scale-95 transition-transform shadow-lg"
          aria-label="Debug panel"
        >
          <Bug className="w-4 h-4 text-[#8B949E]" />
          {(errorCount > 0 || warnCount > 0) && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1">
              {errorCount || warnCount}
            </span>
          )}
        </button>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 bg-[#0D1117]/80 backdrop-blur-sm flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 bg-[#161B22] border-b border-[rgba(255,255,255,0.06)] px-4 py-3 flex items-center gap-3">
            <Bug className="w-5 h-5 text-[#00B4FF]" />
            <h2 className="text-base font-bold text-[#E6EDF3] flex-1">
              Отладка
              {errorCount > 0 && <span className="ml-2 text-red-400 text-xs">🔥 {errorCount}</span>}
              {warnCount > 0 && <span className="ml-2 text-yellow-400 text-xs">⚠ {warnCount}</span>}
            </h2>
            <button onClick={handleSend} disabled={sending}
              className="px-3 py-1.5 bg-[#00B4FF] hover:bg-[#00B4FF]/90 disabled:opacity-50 text-[#0D1117] rounded-lg text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"
            >
              <Send className="w-3 h-3" />
              {sending ? '...' : sentOk === true ? '✅' : sentOk === false ? '❌' : 'Грише'}
            </button>
            <button onClick={() => setOpen(false)}
              className="p-1.5 text-[#8B949E] hover:text-[#E6EDF3] rounded-lg active:scale-95 transition-transform"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filter bar */}
          <div className="flex-shrink-0 bg-[#0D1117] border-b border-[rgba(255,255,255,0.04)] px-3 py-2 flex gap-1 overflow-x-auto">
            {(['all', 'error', 'warn', 'info', 'perf', 'action'] as const).map(level => (
              <button key={level} onClick={() => setFilter(level)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium flex-shrink-0 transition-colors ${
                  filter === level ? 'bg-[#21262D] text-[#E6EDF3]' : 'text-[#8B949E] hover:text-[#E6EDF3]'
                }`}
              >
                {level === 'all' ? 'Все' : level}
                {counts[level] > 0 && <span className="ml-1 opacity-60">{counts[level]}</span>}
              </button>
            ))}
          </div>

          {/* Log list */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Info className="w-10 h-10 text-[#484F58] mb-3" />
                <p className="text-sm text-[#8B949E]">Логов пока нет</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((entry, i) => {
                  const Icon = LEVEL_ICON[entry.level] || Info;
                  const time = new Date(entry.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  return (
                    <div key={i} className={`p-2 rounded-lg border text-xs ${LEVEL_BG[entry.level] || 'bg-[#161B22] border-[rgba(255,255,255,0.04)]'}`}>
                      <div className="flex items-start gap-2">
                        <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${LEVEL_COLOR[entry.level] || 'text-[#8B949E]'}`} />
                        <span className="font-mono text-[10px] text-[#8B949E] flex-shrink-0 w-14">{time}</span>
                        <span className="flex-1 break-all leading-relaxed">{entry.message}</span>
                      </div>
                      {(entry.detail || entry.stack) && (
                        <div className="mt-1 ml-[3.75rem] text-[10px] text-[#8B949E] break-all opacity-70 leading-relaxed">
                          {entry.detail && <div>{entry.detail}</div>}
                          {entry.stack && (
                            <details className="mt-0.5">
                              <summary className="cursor-pointer text-[10px] text-[#484F58] hover:text-[#8B949E]">Stack</summary>
                              <pre className="mt-1 whitespace-pre-wrap text-[9px] max-h-32 overflow-y-auto">{entry.stack}</pre>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 bg-[#161B22] border-t border-[rgba(255,255,255,0.06)] px-4 py-2.5 flex items-center justify-between" style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}>
            <span className="text-[10px] text-[#484F58] font-mono">{logs.length} записей</span>
            <button onClick={() => { clearLogs(); setLogs([]); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-red-400 hover:bg-red-500/10 rounded-lg transition-colors font-medium"
            >
              <Trash2 className="w-3 h-3" /> Очистить
            </button>
          </div>
        </div>
      )}
    </>
  );
}
