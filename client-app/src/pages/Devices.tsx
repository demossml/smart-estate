import { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, Trash2, Radar, Pencil, Loader2, MapPin, RefreshCw, AlertTriangle, Battery, Clock } from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { RoomPicker } from '../components/ui/RoomPicker';
import { RoomAddModal } from '../components/ui/RoomAddModal';
import { api } from '../api/client';
import { DEVICE_TYPE_ICONS, DEVICE_TYPE_LABELS, CircleDot } from '../lib/icon-map';
import { useMode } from '../hooks/useMode';
import { logClient } from '../lib/logger';
import type { Device } from '../types';

type ModalKind = 'add' | 'edit' | 'discover' | null;

interface PendingDevice {
  ieee_address: string;
  friendly_name: string;
  model: string;
  vendor: string;
  suggested_type: string | null;
  exposes?: any[] | null;
}

/* ── Helpers для last_seen ── */
function isLastSeenOld(ts: string): boolean {
  const diff = Date.now() - new Date(ts.replace(' ', 'T')).getTime();
  return diff > 300_000; // 5 минут
}
function formatLastSeen(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts.replace(' ', 'T')).getTime()) / 60000);
  if (diff < 1) return 'только что';
  if (diff < 60) return `${diff} мин`;
  return `${Math.floor(diff / 60)} ч`;
}

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [rooms, setRooms] = useState<{ id: number; name: string; icon: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('light');
  const [formRoom, setFormRoom] = useState<number>(1);
  const [formAddr, setFormAddr] = useState('');

  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const [showAddRoom, setShowAddRoom] = useState(false);

  const [pendingDevices, setPendingDevices] = useState<PendingDevice[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState('');
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set());
  const pollRef = useRef<number | null>(null);

  const editNameRef = useRef<HTMLInputElement>(null);

  // ── Discovery status polling (каждые 5 сек) ──
  const [discoverySecondsLeft, setDiscoverySecondsLeft] = useState<number | null>(null);
  const [discoveryPermitJoin, setDiscoveryPermitJoin] = useState(false);
  const statusPollRef = useRef<number | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await api.getDiscoveryStatus();
        setDiscoveryPermitJoin(res.permit_join);
        setDiscoverySecondsLeft(res.remaining <= 0 ? 0 : res.remaining);
      } catch {
        // ignore
      }
    };
    poll();
    statusPollRef.current = window.setInterval(poll, 5000);
    return () => {
      if (statusPollRef.current) window.clearInterval(statusPollRef.current);
    };
  }, []);

  // Tick секунд для таймера
  useEffect(() => {
    if (discoverySecondsLeft === null || discoverySecondsLeft <= 0) return;
    const tick = setInterval(() => {
      setDiscoverySecondsLeft(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(tick);
  }, [discoverySecondsLeft]);

  useEffect(() => {
    loadDevices();
    api.getRooms().then(r => setRooms(r.rooms)).catch(() => {});
    api.getPendingDevices()
      .then(res => {
        if (res.pending && res.pending.length > 0) {
          setPendingDevices(res.pending);
          setSelectedPending(new Set());
          setModal('discover');
          setDiscoverMsg(`Доступные устройства из Zigbee (${res.pending.length}):`);
        }
      })
      .catch(() => {});
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { mode } = useMode();
  useEffect(() => {
    loadDevices();
    api.getRooms().then(r => setRooms(r.rooms)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const loadDevices = async () => {
    try { setDevices(await api.getDevices()); setOffline(false); }
    catch { setOffline(true); }
    finally { setLoading(false); }
  };

  const addDevice = async () => {
    if (!formName.trim()) return;
    setBusy('add');
    setFormError('');
    try {
      const addr = formAddr.trim() || `manual:${Date.now()}`;
      await api.createDevice(addr, formName.trim(), formType, formRoom);
      resetAddForm(); setModal(null); await loadDevices();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Не удалось добавить устройство';
      setFormError(msg);
      logClient('error', 'Ошибка добавления устройства', msg);
    } finally { setBusy(null); }
  };

  const saveEdit = async () => {
    if (!editDevice || !editDevice.name.trim()) return;
    setBusy('edit');
    setFormError('');
    try {
      await api.updateDevice(editDevice.id, {
        friendly_name: editDevice.name,
        type: editDevice.type,
        room_id: rooms.find(r => r.name === editDevice.room)?.id,
      });
      setEditDevice(null); setModal(null); await loadDevices();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Не удалось сохранить изменения';
      setFormError(msg);
      logClient('error', 'Ошибка сохранения устройства', msg);
    } finally { setBusy(null); }
  };

  const removeDevice = async (id: string) => {
    if (!confirm('Удалить устройство? Данные телеметрии будут потеряны.')) return;
    setBusy(id);
    try {
      await api.deleteDevice(id);
      setDevices(prev => prev.filter(d => d.id !== id));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Не удалось удалить устройство';
      logClient('error', 'Ошибка удаления устройства', msg);
      alert(msg);
    } finally { setBusy(null); }
  };

  const DISCOVER_WINDOW_MS = 25_000;
  const POLL_INTERVAL_MS = 2_000;

  const startDiscover = async () => {
    setDiscovering(true);
    setDiscoverMsg('Включён режим сопряжения… Нажмите кнопку на устройстве.');
    setSelectedPending(new Set());
    if (pollRef.current) window.clearInterval(pollRef.current);

    try {
      await api.discoverDevices();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Не удалось включить сопряжение';
      setDiscoverMsg(msg);
      setDiscovering(false);
      logClient('error', 'Ошибка старта discovery', msg);
      return;
    }

    const poll = async () => {
      try {
        const res = await api.getPendingDevices();
        setPendingDevices(res.pending || []);
        if ((res.pending || []).length > 0) {
          setDiscoverMsg(`Найдено: ${res.pending.length}`);
        }
      } catch {
        // не прерываем поллинг из-за одной неудачной попытки
      }
    };

    await poll();
    pollRef.current = window.setInterval(poll, POLL_INTERVAL_MS);
    window.setTimeout(() => {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      setDiscovering(false);
      setDiscoverMsg(prev => pendingDevices.length > 0 ? prev : 'Новые устройства не найдены. Попробуйте ещё раз.');
    }, DISCOVER_WINDOW_MS);
  };

  const importSelected = async () => {
    setBusy('import');
    let count = 0;
    for (const d of pendingDevices) {
      if (!selectedPending.has(d.ieee_address)) continue;
      try {
        if (!d.suggested_type) {
          logClient('warn', `Тип для ${d.friendly_name} не определён автоматически — пропущено, отредактируйте вручную после импорта`);
        }
        await api.createDevice(d.ieee_address, d.friendly_name, d.suggested_type || 'sensor', undefined);
        count++;
      } catch (error) {
        logClient('error', `Не удалось импортировать ${d.friendly_name}`, error instanceof Error ? error.message : String(error));
      }
    }
    setModal(null); setPendingDevices([]); setBusy(null);
    if (count > 0) await loadDevices();
  };

  const openEdit = (d: Device) => {
    setEditDevice({ ...d });
    setModal('edit');
    setFormError('');
    // Фокус на поле ввода названия через микротаск
    setTimeout(() => editNameRef.current?.focus(), 100);
  };
  const resetAddForm = () => { setFormName(''); setFormType('light'); setFormRoom(1); setFormAddr(''); setFormError(''); };

  const handleCreateRoomFromPicker = async (name: string, iconKey: string) => {
    await api.createRoom(name, iconKey);
    setShowAddRoom(false);
    api.getRooms().then(r => {
      setRooms(r.rooms);
      const created = r.rooms.find((ro: any) => ro.name === name);
      if (created) setFormRoom(created.id);
    }).catch(() => {});
    window.dispatchEvent(new Event('room-created'));
  };

  const filtered = devices.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.room || '').toLowerCase().includes(search.toLowerCase())
  );
  const grouped = filtered.reduce((acc, d) => {
    (acc[d.room || '—'] ||= []).push(d); return acc;
  }, {} as Record<string, Device[]>);

  // ── Mobile keyboard workaround ──
  const scrollSaveIntoView = () => {
    setTimeout(() => {
      const btn = document.querySelector('.se-save-btn');
      btn?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  };

  return (
    <div className="p-4 pb-24 animate-fade-in">
      <header className="mb-4" style={{ minHeight: 64 }}>
        <h1 className="text-xl font-bold text-text">Устройства</h1>
        {offline && <p className="text-xs text-yellow mt-1">офлайн</p>}
        {discoverySecondsLeft !== null && discoverySecondsLeft > 0 ? (
          <div className="mt-2 flex items-center gap-2 bg-green/5 border border-green/20 rounded-card px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-green animate-pulse" />
            <span className="text-xs text-green">Поиск: {discoverySecondsLeft} сек</span>
          </div>
        ) : discoveryPermitJoin === false && discoverySecondsLeft === 0 ? (
          <div className="mt-2 flex items-center gap-2 text-text-dim text-[11px]">
            <Radar size={13} className="text-text-dim" /> Поиск выключен
          </div>
        ) : null}
        <div className="relative mt-3">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input type="search" placeholder="Поиск устройств…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface border border-surface-hover rounded-card pl-10 pr-4 py-2.5
                       text-text placeholder:text-text-dim text-sm outline-none focus:border-blue transition-colors"
            aria-label="Поиск устройств" />
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col gap-1">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : (
        Object.entries(grouped).map(([room, items]) => (
          <section key={room} className="mb-4">
            <h2 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
              <MapPin size={12} /> {room}
            </h2>
            <div className="flex flex-col gap-1">
              {items.map(d => {
                const Icon = DEVICE_TYPE_ICONS[d.type] || CircleDot;
                return (
                  <div key={d.id}
                       onClick={() => openEdit(d)}
                       className="flex items-center gap-3 bg-surface rounded-card px-4 py-3 tap-active
                                  min-h-[56px] transition-colors hover:bg-surface-hover group relative cursor-pointer">
                    <Icon size={20} className="text-text-dim" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text truncate">{d.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <StatusBadge status={d.online ? 'online' : 'offline'} />
                        {d.last_seen && (
                          <span className={`inline-flex items-center gap-1 text-[11px] ${
                            isLastSeenOld(d.last_seen) ? 'text-red-400' : 'text-text-dim'
                          }`}>
                            <Clock size={11} strokeWidth={1.6} />
                            {formatLastSeen(d.last_seen)}
                          </span>
                        )}
                        {d.battery_level !== null && d.battery_level !== undefined && d.battery_level <= 20 && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-yellow-400">
                            <Battery size={11} strokeWidth={1.6} />
                            {d.battery_level}%
                          </span>
                        )}
                      </div>
                    </div>
                    <Pencil size={14} className="opacity-0 group-hover:opacity-40 transition-opacity text-text-dim" />
                    <button
                      onClick={(e) => { e.stopPropagation(); removeDevice(d.id); }}
                      disabled={busy === d.id}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg
                                 text-text-dim hover:text-red hover:bg-red/10 ml-1"
                      aria-label={`Удалить ${d.name}`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {/* FABs */}
      <div className="fixed bottom-20 left-4 flex flex-col gap-2 z-30">
        <button onClick={() => { setModal('discover'); startDiscover(); }}
          className="w-12 h-12 rounded-fab bg-surface border border-surface-hover
                     flex items-center justify-center tap-active shadow-lg hover:border-green transition-colors"
          aria-label="Найти устройства"><Radar size={22} className="text-green" /></button>
        <button onClick={() => { resetAddForm(); setModal('add'); }}
          className="w-12 h-12 rounded-fab bg-surface border border-surface-hover
                     flex items-center justify-center tap-active shadow-lg hover:border-blue transition-colors"
          aria-label="Добавить устройство"><Plus size={22} className="text-blue" /></button>
      </div>

      {/* ═══ ADD MODAL ═══ */}
      {modal === 'add' && (
        <Modal onClose={() => setModal(null)} title="Новое устройство">
          <label className="block text-xs text-text-dim mb-1">Название</label>
          <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
            placeholder="Например: Датчик движения" autoFocus
            className="w-full bg-bg border border-surface-hover rounded-card px-3 py-3 text-text text-sm mb-3 outline-none focus:border-blue" />

          <label className="block text-xs text-text-dim mb-1">Тип</label>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {Object.entries(DEVICE_TYPE_ICONS).map(([value, Icon]) => (
              <button key={value} onClick={() => setFormType(value)}
                className={`py-2.5 px-2 rounded-btn text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 tap-highlight
                  ${formType === value ? 'bg-blue text-white' : 'bg-bg text-text-dim border border-surface-hover hover:border-blue'}`}>
                <Icon size={15} /> {DEVICE_TYPE_LABELS[value] || value}
              </button>
            ))}
          </div>

          <label className="block text-xs text-text-dim mb-1">Комната</label>
          <RoomPicker
            rooms={rooms}
            value={formRoom}
            onChange={(roomId) => setFormRoom(roomId)}
            onCreateRoom={() => setShowAddRoom(true)}
          />

          <label className="block text-xs text-text-dim mb-1">IEEE-адрес (авто)</label>
          <input type="text" value={formAddr} onChange={e => setFormAddr(e.target.value)}
            placeholder="manual:…"
            className="w-full bg-bg border border-surface-hover rounded-card px-3 py-3 text-text text-sm mb-4 outline-none focus:border-blue font-mono" />

          {formError && (
            <p className="text-xs text-red-400 mb-3 flex items-center gap-1.5">
              <AlertTriangle size={13} /> {formError}
            </p>
          )}

          <button onClick={addDevice} disabled={!formName.trim() || busy === 'add'}
            className={`se-save-btn w-full min-h-[56px] rounded-btn font-semibold text-base flex items-center justify-center gap-2 transition-colors
              ${formName.trim() ? 'bg-blue text-white tap-active' : 'bg-surface-hover text-text-dim cursor-not-allowed'}`}>
            {busy === 'add' ? 'Добавление…' : 'Добавить устройство'}
          </button>
        </Modal>
      )}

      {/* ═══ EDIT MODAL ═══ */}
      {modal === 'edit' && editDevice && (
        <Modal onClose={() => { setEditDevice(null); setModal(null); }} title="Редактировать устройство">
          <label className="block text-xs text-text-dim mb-1.5 font-semibold">Название</label>
          <input ref={editNameRef} type="text" value={editDevice.name} autoFocus
            onChange={e => { setEditDevice({ ...editDevice, name: e.target.value }); scrollSaveIntoView(); }}
            onFocus={scrollSaveIntoView}
            className="w-full bg-bg border-2 border-blue/40 rounded-card px-4 py-3.5 text-text text-base mb-4 outline-none focus:border-blue" />

          <label className="block text-xs text-text-dim mb-1.5 font-semibold">Тип</label>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {Object.entries(DEVICE_TYPE_ICONS).map(([value, Icon]) => (
              <button key={value} onClick={() => setEditDevice({ ...editDevice, type: value })}
                className={`py-3 px-2 rounded-btn text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 tap-highlight min-h-[44px]
                  ${editDevice.type === value ? 'bg-blue text-white' : 'bg-bg text-text-dim border border-surface-hover hover:border-blue'}`}>
                <Icon size={16} /> {DEVICE_TYPE_LABELS[value] || value}
              </button>
            ))}
          </div>

          <label className="block text-xs text-text-dim mb-1.5 font-semibold">Комната</label>
          <RoomPicker
            rooms={rooms}
            value={rooms.find(r => r.name === editDevice.room)?.id || ''}
            onChange={(roomId, roomName) => {
              setEditDevice({ ...editDevice, room: roomName });
            }}
            onCreateRoom={() => setShowAddRoom(true)}
          />

          <div className="text-xs text-text-dim mt-3 mb-4 px-1 flex items-center gap-2">
            <code className="bg-surface-hover px-2 py-1 rounded-md text-text font-mono text-[11px]">{editDevice.id}</code>
          </div>

          {formError && (
            <p className="text-xs text-red-400 mb-3 flex items-center gap-1.5 bg-red/5 border border-red/20 rounded-card px-3 py-2">
              <AlertTriangle size={14} /> {formError}
            </p>
          )}

          <div className="flex gap-3 mt-2">
            <button onClick={() => { setEditDevice(null); setModal(null); }}
              className="flex-1 min-h-[56px] rounded-btn font-semibold text-base bg-surface-hover text-text-dim tap-active border border-surface-hover">
              Отмена
            </button>
            <button
              id="edit-save-btn"
              onClick={saveEdit}
              disabled={!editDevice.name.trim() || busy === 'edit'}
              className={`se-save-btn flex-1 min-h-[56px] rounded-btn font-semibold text-base flex items-center justify-center gap-2 transition-colors tap-highlight
                ${editDevice.name.trim() && busy !== 'edit' ? 'bg-blue text-white tap-active' : 'bg-surface-hover text-text-dim cursor-not-allowed'}`}>
              {busy === 'edit' ? (
                <><Loader2 size={18} className="animate-spin" /> Сохранение…</>
              ) : 'Сохранить'}
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ DISCOVER MODAL ═══ */}
      {modal === 'discover' && (
        <Modal onClose={() => { setModal(null); setPendingDevices([]); if (pollRef.current) window.clearInterval(pollRef.current); }} title="Найти устройства">
          {discovering ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={32} className="text-green animate-spin" />
              <p className="text-sm text-text-dim text-center">{discoverMsg}</p>
              {pendingDevices.length > 0 && (
                <p className="text-xs text-green">Найдено уже: {pendingDevices.length} — можно продолжать ждать или выбрать сейчас</p>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-text-dim mb-4">{discoverMsg}</p>
              {pendingDevices.length > 0 ? (
                <>
                  <div className="flex flex-col gap-2 mb-4 max-h-64 overflow-y-auto">
                    {pendingDevices.map(d => {
                      const selected = selectedPending.has(d.ieee_address);
                      return (
                        <label key={d.ieee_address}
                          className={`flex items-center gap-3 p-3 rounded-card border cursor-pointer transition-colors
                            ${selected ? 'border-blue bg-blue/5' : 'border-surface-hover hover:border-blue/50'}`}>
                          <input type="checkbox" checked={selected}
                            onChange={() => { const next = new Set(selectedPending); selected ? next.delete(d.ieee_address) : next.add(d.ieee_address); setSelectedPending(next); }}
                            className="accent-blue w-5 h-5" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-text truncate">{d.friendly_name}</div>
                            <div className="text-xs text-text-dim">{d.vendor} · {d.model}</div>
                          </div>
                          <span className="text-xs bg-surface-hover px-2 py-0.5 rounded-full text-text-dim">
                            {d.suggested_type || 'тип не определён'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedPending(new Set(pendingDevices.map(d => d.ieee_address)))}
                      className="flex-1 px-3 py-3 rounded-btn text-sm border border-surface-hover text-text-dim font-semibold tap-active">Выбрать все</button>
                    <button onClick={importSelected} disabled={selectedPending.size === 0 || busy === 'import'}
                      className={`flex-1 min-h-[52px] rounded-btn font-semibold flex items-center justify-center gap-2 transition-colors
                        ${selectedPending.size > 0 ? 'bg-green text-white tap-active' : 'bg-surface-hover text-text-dim cursor-not-allowed'}`}>
                      {busy === 'import' ? 'Импорт…' : `Добавить (${selectedPending.size})`}
                    </button>
                  </div>
                  <button onClick={startDiscover}
                    className="w-full mt-3 py-3 rounded-btn text-sm text-text-dim border border-surface-hover hover:border-green transition-colors flex items-center justify-center gap-1.5 tap-active min-h-[48px]">
                    <RefreshCw size={16} /> Сканировать заново
                  </button>
                </>
              ) : (
                <button onClick={startDiscover}
                  className="w-full min-h-[52px] rounded-btn font-semibold bg-green text-white tap-active flex items-center justify-center gap-2 text-base">
                  <Radar size={20} /> Сканировать заново
                </button>
              )}
            </>
          )}
        </Modal>
      )}

      {/* ═══ ADD ROOM FROM PICKER ═══ */}
      {showAddRoom && (
        <RoomAddModal onClose={() => setShowAddRoom(false)} onCreate={handleCreateRoomFromPicker} />
      )}
    </div>
  );
}
function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full sm:max-w-lg bg-surface border border-surface-hover rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 animate-slide-up sm:animate-fade-in max-h-[92dvh] overflow-y-auto"
        style={{ maxWidth: 500 }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-surface z-10 pb-2" style={{ backdropFilter: 'blur(8px)' }}>
          <h2 className="text-lg font-bold text-text">{title}</h2>
          <button onClick={onClose} className="p-2.5 rounded-lg hover:bg-surface-hover tap-active"><X size={22} className="text-text-dim" /></button>
        </div>
        {children}
      </div>
      <style>{`
        .tap-highlight { -webkit-tap-highlight-color: transparent; }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slideUp 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}
