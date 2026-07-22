import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, History, Radio, ShieldCheck, Wand2 } from 'lucide-react';
import { api } from '../api/client';
import { Skeleton } from '../components/ui/Skeleton';
import { useEstateSocket } from '../hooks/useEstateSocket';
import { logClient } from '../lib/logger';
import type { EstateEvent } from '../types';

const MOCK_EVENTS: EstateEvent[] = [
  { id: 'ev-1', type: 'scenario', title: 'Вечерний режим выполнен', details: 'Садовый свет включен', ts: new Date(Date.now() - 12 * 60000).toISOString() },
  { id: 'ev-2', type: 'command', title: 'Гараж открыт', details: 'Источник: PWA', ts: new Date(Date.now() - 34 * 60000).toISOString() },
  { id: 'ev-3', type: 'security', title: 'Периметр закрыт', details: 'Все двери и окна закрыты', ts: new Date(Date.now() - 55 * 60000).toISOString() },
  { id: 'ev-4', type: 'error', title: 'Слабый RSSI', details: 'Датчик CO2 на кухне: -82', ts: new Date(Date.now() - 78 * 60000).toISOString() },
];

const icons = {
  command: CheckCircle2,
  error: AlertTriangle,
  state: History,
  security: ShieldCheck,
  scenario: Wand2,
};

export default function Events() {
  const [events, setEvents] = useState<EstateEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const socket = useEstateSocket();

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setEvents(await api.getEvents());
        setOffline(false);
      } catch (error) {
        setOffline(true);
        setEvents(MOCK_EVENTS);
        logClient('warn', 'События: API недоступен, включены mock-данные', error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="p-4 pb-24 animate-fade-in">
      <header className="mb-4" style={{ minHeight: 64 }}>
        <h1 className="text-xl font-bold text-text flex items-center gap-2">
          <ShieldCheck size={22} className="text-blue" />
          События
        </h1>
        <div className="text-xs text-text-dim mt-1 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${socket.connected ? 'bg-green' : 'bg-yellow'}`} />
          WS: {socket.connected ? 'онлайн' : 'ожидание'} · последнее: {socket.lastMessage}
        </div>
        {offline && <p className="text-xs text-yellow mt-1">офлайн — mock-данные</p>}
      </header>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="space-y-2">
          {events.map(event => {
            const Icon = icons[event.type] || Radio;
            const tone = event.type === 'error' ? 'text-red' : event.type === 'security' ? 'text-green' : 'text-blue';
            return (
              <article key={event.id} className="bg-surface rounded-card p-3 border border-surface-hover flex gap-3 min-h-[64px]">
                <Icon size={22} className={`${tone} mt-0.5 shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-text truncate">{event.title}</h2>
                    <time className="text-[10px] text-text-dim shrink-0">
                      {new Date(event.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </div>
                  {event.details && <p className="text-xs text-text-dim mt-1">{event.details}</p>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
