import { useEffect, useState } from 'react';
import { Bug, Send, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import { clearLogs, getLogs, subscribeLogs, type ClientLog } from './logger';

export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<ClientLog[]>(() => getLogs());
  const errorCount = logs.filter(log => log.level === 'error').length;

  useEffect(() => subscribeLogs(setLogs), []);

  const sendLogs = async () => {
    try {
      await api.sendClientLogs(logs);
    } catch {
      // The logger already records failed fetches.
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="safe-debug fixed z-40 w-11 h-11 rounded-fab bg-surface border border-surface-hover
                   flex items-center justify-center tap-active shadow-lg"
        aria-label="Открыть отладку"
      >
        <Bug size={20} className={errorCount ? 'text-red' : 'text-text-dim'} />
        {errorCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-red text-white text-[10px]
                           flex items-center justify-center px-1">
            {errorCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" role="dialog" aria-label="Отладочная панель">
          <div className="bg-surface rounded-t-card w-full max-w-[480px] max-h-[72vh] p-4 animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-text">Отладка</h2>
              <button onClick={() => setOpen(false)} className="w-10 h-10 rounded-btn bg-surface-hover flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              <button onClick={sendLogs} className="flex-1 min-h-[44px] rounded-btn bg-blue text-white font-semibold flex items-center justify-center gap-2">
                <Send size={16} />
                Грише
              </button>
              <button onClick={clearLogs} className="w-12 min-h-[44px] rounded-btn bg-surface-hover flex items-center justify-center">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: '48vh' }}>
              {logs.length === 0 ? (
                <div className="text-sm text-text-dim py-6 text-center">Логов нет</div>
              ) : (
                logs.slice().reverse().map(log => (
                  <div key={log.id} className="rounded-btn bg-bg p-2 border border-surface-hover">
                    <div className={`text-xs font-semibold ${log.level === 'error' ? 'text-red' : log.level === 'warn' ? 'text-yellow' : 'text-blue'}`}>
                      {log.level.toUpperCase()} · {new Date(log.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-sm text-text mt-1">{log.message}</div>
                    {log.details && <div className="text-xs text-text-dim mt-1 break-words">{log.details}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
