import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Thermometer, Flame, Snowflake, Power } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { DEVICE_TYPE_ICONS, getRoomIcon, CircleDot } from '../../lib/icon-map';
import { api } from '../../api/client';
import type { LucideIcon } from 'lucide-react';

// ── Types ───────────────────────────────────────────────

interface DeviceWithTelemetry {
  id: string;
  name: string;
  type: string;
  room: string;
  online: boolean;
  latest_telemetry?: { property: string; value: number; unit: string }[];
}

interface ClimateSetpoint {
  device_ieee: string;
  target_temp: number;
  mode: string;
  current_temp: number | null;
  action: string;
  hysteresis: number;
}

interface RoomTileProps {
  id: string;
  name: string;
  iconKey: string;
  temperature?: number | null;
  lightOn?: boolean;
  onEditDevice?: (device: { id: string; name: string; type: string; room: string; online: boolean }) => void;
}

// ── SensorReadings ──────────────────────────────────────

const SENSOR_LABELS: Record<string, string> = {
  temperature: 'Темп.', humidity: 'Влажн.', co2: 'CO₂',
  illuminance: 'Свет', pressure: 'Давл.', soil_moisture: 'Почва',
};

function SensorReadings({ telemetry }: { telemetry: { property: string; value: number; unit: string }[] }) {
  const readings = telemetry.filter(t => t.property !== 'state' && t.property !== 'linkquality').slice(0, 3);
  if (!readings.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2 mt-2">
      {readings.map(t => {
        const label = SENSOR_LABELS[t.property] || t.property;
        let display = `${t.value}`;
        if (t.property === 'temperature') display = `${t.value}°`;
        else if (t.property === 'humidity') display = `${t.value}%`;
        else if (t.property === 'water_leak') display = t.value > 0 ? 'ТЕЧЬ' : 'Сухо';
        const isAlert = t.property === 'water_leak' && t.value > 0;
        return (
          <div key={t.property} className={`bg-bg rounded-btn px-2 py-2 text-center ${isAlert ? 'border border-red/30' : ''}`}>
            <div className={`font-mono text-sm font-bold ${isAlert ? 'text-red' : 'text-text'}`}>{display}</div>
            <div className="text-[10px] text-text-dim mt-0.5">{label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── DeviceInlineCard ────────────────────────────────────

function DeviceInlineCard({
  device, onToggle, onEdit,
}: { device: DeviceWithTelemetry; onToggle?: (id: string) => void; onEdit?: (d: DeviceWithTelemetry) => void }) {
  const Icon = DEVICE_TYPE_ICONS[device.type] || CircleDot;
  const isToggleable = device.type === 'light' || device.type === 'plug';
  const isOn = device.latest_telemetry?.find(t => t.property === 'state')?.value as number > 0;
  const isSensor = device.type === 'sensor';

  return (
    <div className="flex items-center gap-3 px-1 py-2.5 min-h-[56px] tap-active rounded-card hover:bg-surface-hover/50 transition-colors"
         onClick={() => onEdit?.(device)}>
      <Icon size={20} className="text-text-dim shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text truncate">{device.name}</div>
        <StatusBadge status={device.online ? 'online' : 'offline'} />
      </div>
      {isSensor && device.latest_telemetry && <SensorReadings telemetry={device.latest_telemetry} />}
      {isToggleable && onToggle && (
        <button onClick={(e) => { e.stopPropagation(); onToggle(device.id); }}
          className={`shrink-0 w-12 h-7 rounded-full transition-all flex items-center px-0.5
            ${isOn ? 'bg-blue' : 'bg-surface-hover border border-surface-hover'}`}
          aria-label={isOn ? 'Выключить' : 'Включить'}>
          <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${isOn ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      )}
    </div>
  );
}

// ── ClimateCard (within room) ───────────────────────────

const modeIcons: Record<string, LucideIcon> = { heat: Flame, cool: Snowflake, auto: Thermometer, off: Power };
const modeLabels: Record<string, string> = { heat: 'Обогрев', cool: 'Охлажд.', auto: 'Авто', off: 'Выкл' };

function ClimateCard({ sp, onUpdate }: { sp: ClimateSetpoint; onUpdate: (temp: number, mode: string) => void }) {
  const [localTemp, setLocalTemp] = useState(sp.target_temp);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { setLocalTemp(sp.target_temp); }, [sp.target_temp]);

  const handleTempChange = (val: number) => {
    setLocalTemp(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onUpdate(val, sp.mode), 400);
  };

  return (
    <div className="bg-bg rounded-card px-3 py-3 border border-surface-hover/50 mb-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Thermometer size={16} className="text-blue" />
          <span className="text-sm font-medium text-text">Термостат</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-dim">
            {sp.current_temp != null ? `${sp.current_temp}°` : '—'} → {sp.target_temp}°
          </span>
          <StatusBadge status={sp.action === 'idle' ? 'auto' : sp.action === 'heat' ? 'online' : 'online'}
                       label={sp.action === 'heat' ? 'Греет' : sp.action === 'cool' ? 'Охлаждает' : 'Ожидание'} />
        </div>
      </div>

      {/* Slider */}
      <input type="range" min={16} max={28} step={0.5} value={localTemp}
        onChange={e => handleTempChange(Number(e.target.value))}
        className="w-full accent-blue mb-3" aria-label="Температура" />

      {/* Mode buttons */}
      <div className="grid grid-cols-4 gap-2">
        {(['auto', 'heat', 'cool', 'off'] as string[]).map(mode => {
          const Icon = modeIcons[mode];
          const active = sp.mode === mode;
          return (
            <button key={mode} onClick={() => onUpdate(sp.target_temp, mode)}
              className={`min-h-[40px] rounded-btn text-xs font-semibold flex flex-col items-center justify-center gap-0.5
                ${active ? 'bg-blue text-white' : 'bg-surface-hover text-text-dim hover:text-text'}`}>
              <Icon size={14} />
              {modeLabels[mode]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── RoomTile ────────────────────────────────────────────

export function RoomTile({ id, name, iconKey, temperature, lightOn, onEditDevice }: RoomTileProps) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<DeviceWithTelemetry[]>([]);
  const [climate, setClimate] = useState<ClimateSetpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const RoomIcon = getRoomIcon(iconKey);

  useEffect(() => {
    if (!open || devices.length > 0) return;
    setLoading(true);
    Promise.all([
      api.getRoomDevices(id).catch(() => ({ ok: false, devices: [] } as any)),
      api.getRoomClimate(id).catch(() => ({ ok: false, climate: [] } as any)),
    ]).then(([devRes, climRes]) => {
      setDevices((devRes.devices || []).map((d: any) => ({
        id: d.ieee_addr, name: d.friendly_name, type: d.type,
        room: d.room_name || name, online: d.status === 'online',
        latest_telemetry: d.latest_telemetry || [],
      })));
      setClimate(climRes.climate || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [open, id, name]);

  const handleToggle = useCallback(async (deviceId: string) => {
    const dev = devices.find(d => d.id === deviceId);
    if (!dev) return;
    const isOn = dev.latest_telemetry?.find((t: any) => t.property === 'state')?.value > 0;
    setDevices(prev => prev.map(d => {
      if (d.id !== deviceId) return d;
      const t = [...(d.latest_telemetry || [])];
      const idx = t.findIndex((x: any) => x.property === 'state');
      if (idx >= 0) t[idx] = { ...t[idx], value: isOn ? 0 : 1 };
      else t.push({ property: 'state', value: isOn ? 0 : 1, unit: 'bool' });
      return { ...d, latest_telemetry: t };
    }));
    try { await (isOn ? api.deviceOff(deviceId) : api.deviceOn(deviceId)); }
    catch {
      setDevices(prev => prev.map(d => {
        if (d.id !== deviceId) return d;
        const t = [...(d.latest_telemetry || [])];
        const idx = t.findIndex((x: any) => x.property === 'state');
        if (idx >= 0) t[idx] = { ...t[idx], value: isOn ? 1 : 0 };
        return { ...d, latest_telemetry: t };
      }));
    }
  }, [devices]);

  const handleClimateUpdate = useCallback(async (temp: number, mode: string) => {
    const sp = climate[0];
    if (!sp) return;
    setClimate(prev => prev.map(c => c.device_ieee === sp.device_ieee ? { ...c, target_temp: temp, mode } : c));
    try { await api.updateClimate(sp.device_ieee, temp, mode as any); }
    catch { setClimate(prev => prev.map(c => c.device_ieee === sp.device_ieee ? { ...c, target_temp: sp.target_temp, mode: sp.mode } : c)); }
  }, [climate]);

  return (
    <div className="bg-surface rounded-card border border-surface-hover overflow-hidden transition-all duration-300">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[64px] text-left tap-active" aria-expanded={open}>
        <RoomIcon size={24} className="text-text-dim shrink-0" />
        <span className="text-sm font-semibold text-text flex-1 truncate">{name}</span>
        {temperature != null && <span className="text-sm font-mono text-text-dim mr-1">{temperature}°</span>}
        {lightOn != null && (
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 mr-1 ${lightOn ? 'bg-yellow' : 'bg-surface-hover'}`} />
        )}
        <ChevronDown size={18}
          className={`text-text-dim transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`transition-all duration-300 overflow-hidden ${open ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-4 pb-3 pt-0 border-t border-surface-hover">
          {loading ? (
            <div className="py-4 text-sm text-text-dim text-center">Загрузка…</div>
          ) : (
            <>
              {/* Climate controls — always on top if present */}
              {climate.length > 0 && climate.map(sp => (
                <ClimateCard key={sp.device_ieee} sp={sp} onUpdate={handleClimateUpdate} />
              ))}

              {/* Devices */}
              {devices.length === 0 && climate.length === 0 ? (
                <div className="py-4 text-sm text-text-dim text-center">Нет устройств.</div>
              ) : devices.length > 0 ? (
                <div className="flex flex-col divide-y divide-surface-hover/50">
                  {devices.map(d => (
                    <DeviceInlineCard key={d.id} device={d}
                      onToggle={(did) => handleToggle(did)}
                      onEdit={onEditDevice} />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
