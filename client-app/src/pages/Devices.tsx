import { useState, useEffect } from 'react';
import { Search, Plus, X, Trash2 } from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { api } from '../api/client';
import type { Device } from '../types';

const DEVICE_TYPES = [
  { value: 'light', label: '💡 Свет' },
  { value: 'sensor', label: '📡 Датчик' },
  { value: 'plug', label: '🔌 Розетка' },
  { value: 'gate', label: '🚪 Ворота' },
  { value: 'climate', label: '🌡️ Климат' },
  { value: 'lock', label: '🔒 Замок' },
];

const TYPE_ICONS: Record<string, string> = {
  light: '💡', sensor: '📡', plug: '🔌', gate: '🚪', climate: '🌡️', lock: '🔒',
};

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [rooms, setRooms] = useState<{ id: number; name: string; icon: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Add form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('light');
  const [formRoom, setFormRoom] = useState<number>(1);
  const [formAddr, setFormAddr] = useState('');

  useEffect(() => {
    loadDevices();
    api.getRooms().then(r => setRooms(r.rooms)).catch(() => {});
  }, []);

  const loadDevices = async () => {
    try {
      setDevices(await api.getDevices());
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  };

  const addDevice = async () => {
    if (!formName.trim()) return;
    setBusy('add');
    try {
      const addr = formAddr.trim() || `manual:${Date.now()}`;
      await api.createDevice(addr, formName.trim(), formType, formRoom);
      setFormName('');
      setFormAddr('');
      setShowAdd(false);
      await loadDevices();
    } catch {
      // silently fail
    } finally {
      setBusy(null);
    }
  };

  const removeDevice = async (id: string) => {
    if (!confirm(`Удалить устройство? Данные телеметрии будут потеряны.`)) return;
    setBusy(id);
    try {
      await api.deleteDevice(id);
      setDevices(prev => prev.filter(d => d.id !== id));
    } catch {
      // silently fail
    } finally {
      setBusy(null);
    }
  };

  const filtered = devices.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.room || '').toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc, d) => {
    (acc[d.room || '—'] ||= []).push(d);
    return acc;
  }, {} as Record<string, Device[]>);

  return (
    <div className="p-4 pb-24 animate-fade-in">
      <header className="mb-4" style={{ minHeight: 64 }}>
        <h1 className="text-xl font-bold text-text">Устройства</h1>
        {offline && <p className="text-xs text-yellow mt-1">офлайн</p>}
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
        <div className="flex flex-col gap-1">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : (
        Object.entries(grouped).map(([room, items]) => (
          <section key={room} className="mb-4">
            <h2 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-2 px-1">
              📍 {room}
            </h2>
            <div className="flex flex-col gap-1">
              {items.map(d => (
                <div key={d.id}
                     className="flex items-center gap-3 bg-surface rounded-card px-4 py-3 tap-active
                                min-h-[56px] transition-colors hover:bg-surface-hover group relative">
                  <span className="text-xl" aria-hidden="true">
                    {TYPE_ICONS[d.type] || '🔴'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text truncate">{d.name}</div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={d.online ? 'online' : 'offline'} />
                    </div>
                  </div>
                  {/* Delete button — visible on hover/tap */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeDevice(d.id); }}
                    disabled={busy === d.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg
                               text-text-dim hover:text-red hover:bg-red/10"
                    aria-label={`Удалить ${d.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {/* FAB — Add device */}
      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-20 left-4 w-12 h-12 rounded-fab bg-surface border border-surface-hover
                   flex items-center justify-center tap-active shadow-lg z-30
                   hover:border-blue transition-colors"
        aria-label="Добавить устройство"
      >
        <Plus size={22} className="text-blue" />
      </button>

      {/* Add Device Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
             onClick={() => setShowAdd(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full max-w-md bg-surface border border-surface-hover rounded-t-2xl sm:rounded-2xl p-5 animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-text">Новое устройство</h2>
              <button onClick={() => setShowAdd(false)} className="p-2 rounded-lg hover:bg-surface-hover">
                <X size={20} className="text-text-dim" />
              </button>
            </div>

            {/* Name */}
            <label className="block text-xs text-text-dim mb-1">Название</label>
            <input
              type="text"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="Например: Датчик движения"
              className="w-full bg-bg border border-surface-hover rounded-card px-3 py-2.5 text-text text-sm mb-3 outline-none focus:border-blue"
              autoFocus
            />

            {/* Type */}
            <label className="block text-xs text-text-dim mb-1">Тип</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {DEVICE_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setFormType(t.value)}
                  className={`py-2 px-2 rounded-btn text-xs font-medium transition-colors
                    ${formType === t.value
                      ? 'bg-blue text-white'
                      : 'bg-bg text-text-dim border border-surface-hover hover:border-blue'
                    }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Room */}
            <label className="block text-xs text-text-dim mb-1">Комната</label>
            <select
              value={formRoom}
              onChange={e => setFormRoom(Number(e.target.value))}
              className="w-full bg-bg border border-surface-hover rounded-card px-3 py-2.5 text-text text-sm mb-3 outline-none focus:border-blue"
            >
              {rooms.map(r => (
                <option key={r.id} value={r.id}>{r.icon} {r.name}</option>
              ))}
            </select>

            {/* IEEE Address (optional) */}
            <label className="block text-xs text-text-dim mb-1">IEEE-адрес (авто если пусто)</label>
            <input
              type="text"
              value={formAddr}
              onChange={e => setFormAddr(e.target.value)}
              placeholder="manual:..."
              className="w-full bg-bg border border-surface-hover rounded-card px-3 py-2.5 text-text text-sm mb-4 outline-none focus:border-blue font-mono"
            />

            {/* Submit */}
            <button
              onClick={addDevice}
              disabled={!formName.trim() || busy === 'add'}
              className={`w-full min-h-[48px] rounded-btn font-semibold flex items-center justify-center gap-2 transition-colors
                ${formName.trim()
                  ? 'bg-blue text-white tap-active'
                  : 'bg-surface-hover text-text-dim cursor-not-allowed'
                }`}
            >
              {busy === 'add' ? 'Добавление…' : 'Добавить устройство'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
