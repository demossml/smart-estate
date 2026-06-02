import { useState, useEffect } from 'react';
import { Search, Plus } from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { api } from '../api/client';
import { logClient } from '../lib/logger';
import type { Device } from '../types';

const MOCK_DEVICES: Device[] = [
  { id: '1', name: 'Основной свет', type: 'light', room: 'Гостиная', online: true, power: 15 },
  { id: '2', name: 'Датчик температуры', type: 'sensor', room: 'Гостиная', online: true },
  { id: '3', name: 'Холодильник', type: 'plug', room: 'Кухня', online: true, power: 120 },
  { id: '4', name: 'Датчик CO₂', type: 'sensor', room: 'Кухня', online: true, rssi: -82 },
  { id: '5', name: 'Кондиционер', type: 'climate', room: 'Спальня', online: false },
];

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setDevices(await api.getDevices());
      } catch (error) {
        setOffline(true);
        setDevices(MOCK_DEVICES);
        logClient('warn', 'Устройства: API недоступен, включены mock-данные', error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = devices.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.room.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc, d) => {
    (acc[d.room] ||= []).push(d);
    return acc;
  }, {} as Record<string, Device[]>);

  return (
    <div className="p-4 pb-24 animate-fade-in">
      <header className="mb-4" style={{ minHeight: 64 }}>
        <h1 className="text-xl font-bold text-text">Устройства</h1>
        {offline && <p className="text-xs text-yellow mt-1">офлайн — mock-данные</p>}
        <div className="relative mt-3">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="search"
            placeholder="Поиск устройств..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface border border-surface-hover rounded-card pl-10 pr-4 py-2.5
                       text-text placeholder:text-text-dim text-sm outline-none
                       focus:border-blue transition-colors"
            aria-label="Поиск устройств"
          />
        </div>
      </header>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : (
        Object.entries(grouped).map(([room, items]) => (
          <section key={room} className="mb-4">
            <h2 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-2 px-1">
              📍 {room}
            </h2>
            <div className="space-y-1">
              {items.map(d => (
                <div key={d.id}
                     className="flex items-center gap-3 bg-surface rounded-card px-4 py-3 tap-active
                                min-h-[56px] transition-colors hover:bg-surface-hover"
                     role="button" tabIndex={0}>
                  <span className="text-xl" aria-hidden="true">
                    {d.type === 'light' ? '💡' : d.type === 'climate' ? '🌡️' : d.type === 'plug' ? '🔌' : '🔴'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text truncate">{d.name}</div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={d.online ? 'online' : 'offline'} />
                      {d.power && <span className="text-xs text-text-dim">{d.power} Вт</span>}
                      {d.rssi && <span className="text-xs text-yellow">RSSI {d.rssi}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {/* Add device button — service mode only */}
      <button className="fixed bottom-20 left-4 w-12 h-12 rounded-fab bg-surface border border-surface-hover
                         flex items-center justify-center tap-active shadow-lg z-30"
              aria-label="Добавить устройство">
        <Plus size={22} className="text-text-dim" />
      </button>
    </div>
  );
}
