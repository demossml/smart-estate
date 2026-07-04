import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Thermometer, Flame, Snowflake, Power } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { AirQualityBadge } from './AirQualityBadge';
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
  voc: 'VOC', formaldehyde: 'CH₂O', pm25: 'PM2.5',
  illuminance: 'Свет', pressure: 'Давл.', soil_moisture: 'Почва',
  battery: 'Батар.', voltage: 'Вольт.', current: 'Ток', power: 'Мощн.',
  energy: 'Энерг.', presence: 'Движ.', contact: 'Дверь', water_leak: 'Течь',
};

function SensorReadings({ telemetry }: { telemetry: { property: string; value: number; unit: string }[] }) {
  const readings = telemetry.filter(t => t.property !== 'state' && t.property !== 'linkquality');
  if (!readings.length) return null;
  const cols = readings.length === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <div className={`grid ${cols} gap-2 mt-2`}>
      {readings.map(t => {
        const label = SENSOR_LABELS[t.property] || t.property;
        let display = `${t.value}`;
        if (t.property === 'temperature') display = `${t.value}°`;
        else if (t.property === 'humidity' || t.property === 'battery' || t.property === 'soil_moisture') display = `${t.value}%`;
        else if (t.property === 'co2') display = `${t.value} ppm`;
        else if (t.property === 'pm25') display = `${t.value} µg`;
        else if (t.property === 'voc') display = `${t.value} ppb`;
        else if (t.property === 'water_leak') display = t.value > 0 ? 'ТЕЧЬ' : 'Сухо';
        else if (t.property === 'contact') display = t.value > 0 ? 'Открыто' : 'Закрыто';
        else if (t.property === 'presence') display = t.value > 0 ? 'Есть' : 'Нет';
        else if (t.property === 'power') display = `${t.value} Вт`;
        else if (t.property === 'energy') display = `${t.value} кВт`;
        else if (t.property === 'voltage') display = `${t.value} В`;
        else if (t.property === 'current') display = `${t.value} А`;
        else if (t.property === 'pressure') display = `${t.value} гПа`;
        else if (t.property === 'illuminance') display = `${t.value} лк`;
        const isAlert = (t.property === 'water_leak' && t.value > 0) || (t.property === 'contact' && t.value > 0);
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
  const isToggleable = device.type === 'light' || device.type === 'plug' || device.type === 'fan';
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
const modeActionColors: Record<string, string> = { 
  heat: 'bg-orange/20 text-orange border-orange/40', 
  cool: 'bg-blue/20 text-blue border-blue/40', 
  idle: 'bg-green/10 text-green', 
};

function ClimateCard({ sp, onUpdate }: { sp: ClimateSetpoint; onUpdate: (temp: number, mode: string) => void }) {
  const [localTemp, setLocalTemp] = useState(sp.target_temp);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [justChanged, setJustChanged] = useState(false);

  useEffect(() => { setLocalTemp(sp.target_temp); }, [sp.target_temp]);

  const handleTempChange = (val: number) => {
    setLocalTemp(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdate(val, sp.mode);
      setJustChanged(true);
      setTimeout(() => setJustChanged(false), 1500);
    }, 300);
  };

  const handleModeChange = (mode: string) => {
    onUpdate(sp.target_temp, mode);
    setJustChanged(true);
    setTimeout(() => setJustChanged(false), 1500);
  };

  // Which action is active: 'heat', 'cool', or 'idle'
  const currentAction = sp.action || 'idle';
  const isHeating = currentAction === 'heat';
  const isCooling = currentAction === 'cool';
  const isIdle = currentAction === 'idle';

  return (
    <div className="bg-bg rounded-card px-3 py-3 border border-surface-hover/50 mb-2">
      {/* Header: current state big and visible */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Thermometer size={18} className={isHeating ? 'text-orange' : isCooling ? 'text-blue' : 'text-text-dim'} />
          <span className="text-sm font-semibold text-text">Термостат</span>
        </div>
        {/* Action badge — large and clear */}
        <div className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${modeActionColors[currentAction]}`}>
          {isHeating && <Flame size={14} />}
          {isCooling && <Snowflake size={14} />}
          {isIdle && <span className="w-2 h-2 rounded-full bg-green inline-block" />}
          {currentAction === 'heat' ? 'Греет' : currentAction === 'cool' ? 'Охлаждает' : 'Ожидание'}
        </div>
      </div>

      {/* Temperature display: current → target */}
      <div className="flex items-center justify-center gap-3 mb-3">
        <span className="text-2xl font-bold text-text">
          {sp.current_temp != null ? `${sp.current_temp}°` : '—'}
        </span>
        <span className="text-text-dim text-lg">→</span>
        <span className={`text-2xl font-bold transition-colors duration-300 ${justChanged ? 'text-blue' : 'text-text'}`}>
          {sp.target_temp}°
        </span>
      </div>

      {/* Slider — big touch target */}
      <div className="py-2 mb-2">
        <input type="range" min={16} max={28} step={0.5} value={localTemp}
          onChange={e => handleTempChange(Number(e.target.value))}
          className="w-full h-10 accent-blue cursor-pointer" aria-label="Целевая температура" />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-text-dim">16°</span>
          <span className="text-[10px] text-text-dim">28°</span>
        </div>
      </div>

      {/* Mode buttons — highlight which action matches */}
      <div className="grid grid-cols-4 gap-2">
        {(['auto', 'heat', 'cool', 'off'] as string[]).map(mode => {
          const Icon = modeIcons[mode];
          const isSetMode = sp.mode === mode;
          // In AUTO mode, also highlight the matching action button
          const isActiveAction = sp.mode === 'auto' && 
            ((mode === 'heat' && isHeating) || (mode === 'cool' && isCooling));
          const active = isSetMode || isActiveAction;
          const isActionMatch = isSetMode ? true : isActiveAction;
          
          return (
            <button key={mode} onClick={() => handleModeChange(mode)}
              className={`min-h-[48px] rounded-btn text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition-all
                ${isSetMode ? 'bg-blue text-white shadow-sm' : 
                  isActiveAction ? 'border-2 border-blue/60 text-blue bg-blue/5' : 
                  'bg-surface-hover text-text-dim hover:text-text'}`}>
              <Icon size={14} />
              {modeLabels[mode]}
              {/* Show a dot if this is the active action but not the set mode (auto) */}
              {isActiveAction && !isSetMode && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue mt-0.5" />
              )}
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
  const [airQuality, setAirQuality] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const RoomIcon = getRoomIcon(iconKey);

  useEffect(() => {
    if (!open || devices.length > 0) return;
    setLoading(true);
    Promise.all([
      api.getRoomDevices(id).catch(() => ({ ok: false, devices: [] } as any)),
      api.getRoomClimate(id).catch(() => ({ ok: false, climate: [] } as any)),
      api.getAirQuality().catch(() => ({ ok: false, air_quality: [] } as any)),
    ]).then(([devRes, climRes, airRes]) => {
      setDevices((devRes.devices || []).map((d: any) => ({
        id: d.ieee_addr, name: d.friendly_name, type: d.type,
        room: d.room_name || name, online: d.status === 'online',
        latest_telemetry: d.latest_telemetry || [],
      })));
      setClimate(climRes.climate || []);
      // Фильтруем качество воздуха для этой комнаты
      const aq = (airRes.air_quality || []).filter((a: any) => a.room_name === name);
      setAirQuality(aq);
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

              {/* Air Quality — for rooms with air sensors */}
              {airQuality.length > 0 && (
                <div className="mb-3">
                  {airQuality.map(aq => (
                    <AirQualityBadge key={aq.device_ieee} data={aq} />
                  ))}
                </div>
              )}

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
