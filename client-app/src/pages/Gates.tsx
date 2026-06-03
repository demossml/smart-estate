import { useEffect, useState } from 'react';
import { DoorClosed, DoorOpen, Lock, Unlock } from 'lucide-react';
import { api } from '../api/client';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/StatusBadge';
import { logClient } from '../lib/logger';
import type { Gate } from '../types';

const MOCK_GATES: Gate[] = [
  { id: 'gate-1', name: 'Въездные ворота', status: 'closed', online: true, lastAction: 'Закрыты 18:20' },
  { id: 'gate-2', name: 'Гараж', status: 'open', online: true, lastAction: 'Открыт Дмитрием' },
];

const statusLabel: Record<string, string> = {
  open: 'Открыто',
  closed: 'Закрыто',
  moving: 'Движение',
  error: 'Ошибка',
};

export default function Gates() {
  const [gates, setGates] = useState<Gate[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<Record<string, 'open' | 'close' | null>>({});

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setGates(await api.getGates());
        setOffline(false);
      } catch (error) {
        setOffline(true);
        setGates(MOCK_GATES);
        logClient('warn', 'Ворота: API недоступен, включены mock-данные', error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const command = async (id: string, action: 'open' | 'close') => {
    // Mark busy
    setBusy(prev => ({ ...prev, [id]: action }));

    // Optimistic update
    setGates(prev => prev.map(gate =>
      gate.id === id
        ? { ...gate, status: action === 'open' ? 'open' : 'closed', lastAction: `${action === 'open' ? 'Открыто' : 'Закрыто'} сейчас` }
        : gate
    ));

    try {
      const result = await (action === 'open' ? api.openGate(id) : api.closeGate(id));
      setGates(prev => prev.map(gate =>
        gate.id === id
          ? {
              ...gate,
              status: (result.state as Gate['status']) || (action === 'open' ? 'open' : 'closed'),
              lastAction: `${action === 'open' ? 'Открыто' : 'Закрыто'} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            }
          : gate
      ));
    } catch {
      // Silently revert — no error text
      setGates(prev => prev.map(gate =>
        gate.id === id
          ? { ...gate, status: action === 'open' ? 'closed' : 'open', lastAction: gate.lastAction || '' }
          : gate
      ));
    } finally {
      setBusy(prev => ({ ...prev, [id]: null }));
    }
  };

  return (
    <div className="p-4 pb-24 animate-fade-in">
      <header className="mb-4" style={{ minHeight: 64 }}>
        <h1 className="text-xl font-bold text-text flex items-center gap-2">
          <DoorOpen size={22} className="text-blue" />
          Ворота
        </h1>
        {offline && <p className="text-xs text-yellow mt-1">офлайн — mock-данные</p>}
      </header>

      {loading ? (
        <div className="flex flex-col gap-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {gates.map(gate => {
            const opened = gate.status === 'open';
            const isClosing = busy[gate.id] === 'close';
            const isOpening = busy[gate.id] === 'open';
            const isBusy = isClosing || isOpening;

            // Tile background
            let tileBg = 'bg-amber-950/20 border-amber-900/20';
            if (opened) tileBg = 'bg-green/10 border-green/20';
            if (isClosing) tileBg = 'bg-amber-950/40 border-amber-900/30';
            if (isOpening) tileBg = 'bg-green/20 border-green/30';

            // Icon color
            let iconColor = 'text-amber-400';
            if (opened) iconColor = 'text-green';
            if (isClosing) iconColor = 'text-amber-300';
            if (isOpening) iconColor = 'text-green';

            // Status text
            let statusText = statusLabel[gate.status] || gate.status;
            let statusColor = 'text-amber-300';
            if (opened) statusColor = 'text-green';
            if (isClosing) { statusText = 'Закрывается…'; statusColor = 'text-amber-200'; }
            if (isOpening) { statusText = 'Открывается…'; statusColor = 'text-green'; }

            // Button styles: only ONE colored at a time
            const openActive = isOpening || (opened && !isBusy);
            const closeActive = isClosing || (!opened && !isBusy);

            const openBtnClass = openActive
              ? 'bg-blue text-white'
              : 'bg-transparent text-text-dim border border-surface-hover';

            const closeBtnClass = closeActive
              ? 'bg-red-600 text-white'
              : 'bg-transparent text-text-dim border border-surface-hover';

            return (
              <section
                key={gate.id}
                className={`rounded-card p-4 border transition-all duration-300 ${tileBg}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  {opened
                    ? <DoorOpen size={34} className={`transition-colors duration-300 ${iconColor}`} />
                    : <DoorClosed size={34} className={`transition-colors duration-300 ${iconColor}`} />
                  }
                  <div className="flex-1">
                    <h2 className="font-semibold text-text">{gate.name}</h2>
                    <p className={`text-sm transition-colors duration-300 ${statusColor}`}>{statusText}</p>
                  </div>
                  <StatusBadge status={gate.online ? 'online' : 'offline'} />
                </div>
                <p className="text-xs text-text-dim mb-3">{gate.lastAction || 'Журнал пуст'}</p>
                <div className="grid grid-cols-2 gap-2">
                  {/* Open button */}
                  <button
                    onClick={() => command(gate.id, 'open')}
                    disabled={isBusy}
                    className={`min-h-[48px] rounded-btn font-semibold flex items-center justify-center gap-2 tap-active transition-all duration-200 ${openBtnClass} ${isBusy && !isOpening ? 'opacity-50' : ''}`}
                  >
                    <Unlock size={18} />
                    Открыть
                  </button>
                  {/* Close button */}
                  <button
                    onClick={() => command(gate.id, 'close')}
                    disabled={isBusy}
                    className={`min-h-[48px] rounded-btn font-semibold flex items-center justify-center gap-2 tap-active transition-all duration-200 ${closeBtnClass} ${isBusy && !isClosing ? 'opacity-50' : ''}`}
                  >
                    <Lock size={18} />
                    Закрыть
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
