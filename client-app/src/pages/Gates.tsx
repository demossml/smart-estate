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

const statusLabel = {
  open: 'Открыто',
  closed: 'Закрыто',
  moving: 'Движение',
  error: 'Ошибка',
};

export default function Gates() {
  const [gates, setGates] = useState<Gate[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

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
    // Optimistic update
    setGates(prev => prev.map(gate => gate.id === id ? { ...gate, status: action === 'open' ? 'open' : 'closed', lastAction: `${action === 'open' ? 'Открыто' : 'Закрыто'} сейчас` } : gate));
    try {
      const result = await (action === 'open' ? api.openGate(id) : api.closeGate(id));
      setGates(prev => prev.map(gate => gate.id === id ? {
        ...gate,
        status: result.state as Gate['status'],
        lastAction: `${action === 'open' ? 'Открыто' : 'Закрыто'} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      } : gate));
    } catch (error) {
      logClient('warn', 'Команда ворот не выполнена', error instanceof Error ? error.message : String(error));
      setGates(prev => prev.map(gate => gate.id === id ? { ...gate, lastAction: '⚠️ Ошибка' } : gate));
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
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : (
        <div className="space-y-3">
          {gates.map(gate => {
            const opened = gate.status === 'open';
            return (
              <section key={gate.id} className={`rounded-card p-4 border ${opened ? 'bg-yellow/10 border-yellow/20' : 'bg-green/10 border-green/20'}`}>
                <div className="flex items-center gap-3 mb-3">
                  {opened ? <DoorOpen size={34} className="text-yellow" /> : <DoorClosed size={34} className="text-green" />}
                  <div className="flex-1">
                    <h2 className="font-semibold text-text">{gate.name}</h2>
                    <p className={`text-sm ${opened ? 'text-yellow' : 'text-green'}`}>{statusLabel[gate.status]}</p>
                  </div>
                  <StatusBadge status={gate.online ? 'online' : 'offline'} />
                </div>
                <p className="text-xs text-text-dim mb-3">{gate.lastAction || 'Журнал пуст'}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => command(gate.id, 'open')} className="min-h-[48px] rounded-btn bg-blue text-white font-semibold flex items-center justify-center gap-2 tap-active">
                    <Unlock size={18} />
                    Открыть
                  </button>
                  <button onClick={() => command(gate.id, 'close')} className="min-h-[48px] rounded-btn bg-surface text-text font-semibold flex items-center justify-center gap-2 tap-active border border-surface-hover">
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
