import { useState, useEffect } from 'react';
import { Search, Plus, X, Trash2, Radar, Pencil, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { api } from '../api/client';
import { DEVICE_TYPE_ICONS, DEVICE_TYPE_LABELS, CircleDot } from '../lib/icon-map';
import type { Device } from '../types';

type ModalKind = 'add' | 'edit' | 'discover' | null;

interface PendingDevice {
  ieee_address: string;
  friendly_name: string;
  model: string;
  vendor: string;
  type: string;
}

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [rooms, setRooms] = useState<{ id: number; name: string; icon: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('light');
  const [formRoom, setFormRoom] = useState<number>(1);
  const [formAddr, setFormAddr] = useState('');

  const [editDevice, setEditDevice] = useState<Device | null>(null);

  const [pendingDevices, setPendingDevices] = useState<PendingDevice[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState('');
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDevices();
    api.getRooms().then(r => setRooms(r.rooms)).catch(() => {});
  }, []);

  const loadDevices = async () => {
    try { setDevices(await api.getDevices()); setOffline(false); }
    catch { setOffline(true); }
    finally { setLoading(false); }
  };

  const addDevice = async () => {
    if (!formName.trim()) return;
    setBusy('add');
    try {
      const addr = formAddr.trim() || `manual:${Date.now()}`;
      await api.createDevice(addr, formName.trim(), formType, formRoom);
      resetAddForm(); setModal(null); await loadDevices();
    } catch {} finally { setBusy(null); }
  };

  const saveEdit = async () => {
    if (!editDevice) return;
    setBusy('edit');
    try {
      await api.updateDevice(editDevice.id, {
        friendly_name: editDevice.name,
        type: editDevice.type,
        room_id: rooms.find(r => r.name === editDevice.room)?.id,
      });
      setEditDevice(null); setModal(null); await loadDevices();
    } catch {} finally { setBusy(null); }
  };

  const removeDevice = async (id: string) => {
    if (!confirm('Удалить устройство? Данные телеметрии будут потеряны.')) return;
    setBusy(id);
    try { await api.deleteDevice(id); setDevices(prev => prev.filter(d => d.id !== id)); }
    catch {} finally { setBusy(null); }
  };

  const startDiscover = async () => {
    setDiscovering(true);
    setDiscoverMsg('Включён режим сопряжения… Ждём 10 секунд…');
    setSelectedPending(new Set());
    try {
      const res = await api.discoverDevices();
      if (res.reason === 'zigbee2mqtt_unavailable') {
        setDiscoverMsg('Zigbee2MQTT недоступен (режим DEMO).');
        setPendingDevices([]);
      } else {
        setDiscoverMsg(res.discovered.length ? `Найдено: ${res.discovered.length}` : 'Новые устройства не найдены.');
        setPendingDevices(res.discovered);
      }
    } catch { setDiscoverMsg('Ошибка сканирования.'); }
    finally { setDiscovering(false); }
  };

  const importSelected = async () => {
    setBusy('import');
    let count = 0;
    for (const d of pendingDevices) {
      if (!selectedPending.has(d.ieee_address)) continue;
      try { await api.createDevice(d.ieee_address, d.friendly_name, mapZ2MType(d.type), undefined); count++; }
      catch {}
    }
    setModal(null); setPendingDevices([]); setBusy(null);
    if (count > 0) await loadDevices();
  };

  const openEdit = (d: Device) => { setEditDevice({ ...d }); setModal('edit'); };
  const resetAddForm = () => { setFormName(''); setFormType('light'); setFormRoom(1); setFormAddr(''); };

  const filtered = devices.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.room || '').toLowerCase().includes(search.toLowerCase())
  );
  const grouped = filtered.reduce((acc, d) => {
    (acc[d.room || '—'] ||= []).push(d); return acc;
  }, {} as Record<string, Device[]>);

  return (
    <div className="p-4 pb-24 animate-fade-in">
      <header className="mb-4" style={{ minHeight: 64 }}>
        <h1 className="text-xl font-bold text-text">Устройства</h1>
        {offline && <p className="text-xs text-yellow mt-1">офлайн</p>}
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
                      <StatusBadge status={d.online ? 'online' : 'offline'} />
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
            className="w-full bg-bg border border-surface-hover rounded-card px-3 py-2.5 text-text text-sm mb-3 outline-none focus:border-blue" />

          <label className="block text-xs text-text-dim mb-1">Тип</label>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {Object.entries(DEVICE_TYPE_ICONS).map(([value, Icon]) => (
              <button key={value} onClick={() => setFormType(value)}
                className={`py-2 px-2 rounded-btn text-xs font-medium transition-colors flex items-center justify-center gap-1.5
                  ${formType === value ? 'bg-blue text-white' : 'bg-bg text-text-dim border border-surface-hover hover:border-blue'}`}>
                <Icon size={14} /> {DEVICE_TYPE_LABELS[value] || value}
              </button>
            ))}
          </div>

          <label className="block text-xs text-text-dim mb-1">Комната</label>
          <select value={formRoom} onChange={e => setFormRoom(Number(e.target.value))}
            className="w-full bg-bg border border-surface-hover rounded-card px-3 py-2.5 text-text text-sm mb-3 outline-none focus:border-blue">
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <label className="block text-xs text-text-dim mb-1">IEEE-адрес (авто)</label>
          <input type="text" value={formAddr} onChange={e => setFormAddr(e.target.value)}
            placeholder="manual:…"
            className="w-full bg-bg border border-surface-hover rounded-card px-3 py-2.5 text-text text-sm mb-4 outline-none focus:border-blue font-mono" />

          <button onClick={addDevice} disabled={!formName.trim() || busy === 'add'}
            className={`w-full min-h-[48px] rounded-btn font-semibold flex items-center justify-center gap-2 transition-colors
              ${formName.trim() ? 'bg-blue text-white tap-active' : 'bg-surface-hover text-text-dim cursor-not-allowed'}`}>
            {busy === 'add' ? 'Добавление…' : 'Добавить устройство'}
          </button>
        </Modal>
      )}

      {/* ═══ EDIT MODAL ═══ */}
      {modal === 'edit' && editDevice && (
        <Modal onClose={() => { setEditDevice(null); setModal(null); }} title="Редактировать">
          <label className="block text-xs text-text-dim mb-1">Название</label>
          <input type="text" value={editDevice.name} autoFocus
            onChange={e => setEditDevice({ ...editDevice, name: e.target.value })}
            className="w-full bg-bg border border-surface-hover rounded-card px-3 py-2.5 text-text text-sm mb-3 outline-none focus:border-blue" />

          <label className="block text-xs text-text-dim mb-1">Тип</label>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {Object.entries(DEVICE_TYPE_ICONS).map(([value, Icon]) => (
              <button key={value} onClick={() => setEditDevice({ ...editDevice, type: value })}
                className={`py-2 px-2 rounded-btn text-xs font-medium transition-colors flex items-center justify-center gap-1.5
                  ${editDevice.type === value ? 'bg-blue text-white' : 'bg-bg text-text-dim border border-surface-hover hover:border-blue'}`}>
                <Icon size={14} /> {DEVICE_TYPE_LABELS[value] || value}
              </button>
            ))}
          </div>

          <label className="block text-xs text-text-dim mb-1">Комната</label>
          <select value={rooms.find(r => r.name === editDevice.room)?.id || ''}
            onChange={e => { const room = rooms.find(r => r.id === Number(e.target.value)); setEditDevice({ ...editDevice, room: room?.name || editDevice.room }); }}
            className="w-full bg-bg border border-surface-hover rounded-card px-3 py-2.5 text-text text-sm mb-3 outline-none focus:border-blue">
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <div className="text-xs text-text-dim mb-4 px-1">
            IEEE: <code className="text-text font-mono">{editDevice.id}</code>
          </div>

          <button onClick={saveEdit} disabled={!editDevice.name.trim() || busy === 'edit'}
            className={`w-full min-h-[48px] rounded-btn font-semibold flex items-center justify-center gap-2 transition-colors
              ${editDevice.name.trim() ? 'bg-blue text-white tap-active' : 'bg-surface-hover text-text-dim cursor-not-allowed'}`}>
            {busy === 'edit' ? 'Сохранение…' : 'Сохранить'}
          </button>
        </Modal>
      )}

      {/* ═══ DISCOVER MODAL ═══ */}
      {modal === 'discover' && (
        <Modal onClose={() => { setModal(null); setPendingDevices([]); }} title="Найти устройства">
          {discovering ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={32} className="text-green animate-spin" />
              <p className="text-sm text-text-dim text-center">{discoverMsg}</p>
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
                            className="accent-blue w-4 h-4" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-text truncate">{d.friendly_name}</div>
                            <div className="text-xs text-text-dim">{d.vendor} · {d.model}</div>
                          </div>
                          <span className="text-xs bg-surface-hover px-2 py-0.5 rounded-full text-text-dim">{d.type}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedPending(new Set(pendingDevices.map(d => d.ieee_address)))}
                      className="flex-1 px-3 py-2 rounded-btn text-xs border border-surface-hover text-text-dim">Выбрать все</button>
                    <button onClick={importSelected} disabled={selectedPending.size === 0 || busy === 'import'}
                      className={`flex-1 min-h-[48px] rounded-btn font-semibold flex items-center justify-center gap-2 transition-colors
                        ${selectedPending.size > 0 ? 'bg-green text-white tap-active' : 'bg-surface-hover text-text-dim cursor-not-allowed'}`}>
                      {busy === 'import' ? 'Импорт…' : `Добавить (${selectedPending.size})`}
                    </button>
                  </div>
                  <button onClick={startDiscover}
                    className="w-full mt-2 py-2.5 rounded-btn text-sm text-text-dim border border-surface-hover hover:border-green transition-colors flex items-center justify-center gap-1.5">
                    <RefreshCw size={14} /> Сканировать заново
                  </button>
                </>
              ) : (
                <button onClick={startDiscover}
                  className="w-full min-h-[48px] rounded-btn font-semibold bg-green text-white tap-active flex items-center justify-center gap-2">
                  <Radar size={18} /> Сканировать заново
                </button>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function mapZ2MType(z2mType: string): string {
  const m: Record<string, string> = {
    light: 'light', switch: 'light', dimmer: 'light',
    sensor: 'sensor', plug: 'plug',
    cover: 'gate', lock: 'lock', climate: 'climate',
  };
  return m[z2mType] || 'sensor';
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-md bg-surface border border-surface-hover rounded-t-2xl sm:rounded-2xl p-5 animate-slide-up"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-hover"><X size={20} className="text-text-dim" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
