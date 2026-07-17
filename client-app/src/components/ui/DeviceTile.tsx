import {
  User, Activity, DoorClosed, DoorOpen, Droplets, Wind,
  Lightbulb, Plug as PlugIcon, Thermometer, Battery, Signal,
  Home, Sofa, Bed, UtensilsCrossed, TreePine,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────── */

interface DeviceTelemetry {
  property: string;
  value: number;
  unit: string;
}

export interface DeviceData {
  id?: string;
  ieee_addr: string;
  friendly_name?: string;
  type: string;
  latest_telemetry?: DeviceTelemetry[];
  computed_status?: { property: string; label: string; icon: string; color: string } | null;
  battery?: number | null;
  linkquality?: number | null;
  last_presence_minutes?: number | null;
  state?: boolean;
}

/* ── Helpers ───────────────────────────────────────────── */

export const DEVICE_TYPE_META: Record<string, { label: string; category: string; icon: React.FC<{ size?: number; strokeWidth?: number }> }> = {
  window_sensor:   { label: 'Датчик окна',        category: 'contact',  icon: DoorClosed },
  door_sensor:     { label: 'Датчик двери',        category: 'contact',  icon: DoorClosed },
  presence_sensor: { label: 'Датчик присутствия',  category: 'presence', icon: User },
  motion_sensor:   { label: 'Датчик движения',     category: 'presence', icon: Activity },
  leak_sensor:     { label: 'Датчик протечки',     category: 'leak',     icon: Droplets },
  air_monitor:     { label: 'Климат-монитор',      category: 'air',      icon: Wind },
  light:           { label: 'Освещение',           category: 'light',    icon: Lightbulb },
  plug:            { label: 'Розетка',              category: 'plug',     icon: PlugIcon },
  gate_controller: { label: 'Ворота',              category: 'gate',     icon: DoorOpen },
  climate:         { label: 'Кондиционер',          category: 'climate',  icon: Thermometer },
  sensor:          { label: 'Датчик',               category: 'sensor',   icon: Activity },
};

export const ROOM_ICONS: Record<string, React.FC<{ size?: number; strokeWidth?: number }>> = {
  hallway: DoorOpen,
  living: Sofa,
  bedroom: Bed,
  kitchen: UtensilsCrossed,
  yard: TreePine,
};

function batteryColor(pct: number | null): string {
  if (pct === null) return '#5A5F58';
  if (pct <= 10) return '#B23B34';
  if (pct <= 20) return '#C9A24B';
  return '#7FA98F';
}

function getTelemetry(device: DeviceData, prop: string): { value: number | null; unit: string } {
  const t = device.latest_telemetry?.find(t => t.property === prop);
  return { value: t?.value ?? null, unit: t?.unit ?? '' };
}

type StatusInfo = { label: string; color: string; alert: boolean };

function getDeviceStatus(device: DeviceData): StatusInfo | null {
  const contactTel = getTelemetry(device, 'contact');
  const presenceTel = getTelemetry(device, 'presence');
  const leakTel = getTelemetry(device, 'water_leak');

  if (device.type === 'window_sensor' || device.type === 'door_sensor') {
    const open = contactTel.value === 1;
    return { label: open ? 'Открыто' : 'Закрыто', color: open ? '#D9695F' : '#7FA98F', alert: open };
  }
  if (device.type === 'presence_sensor' || device.type === 'motion_sensor') {
    const on = presenceTel.value === 1;
    return on
      ? { label: 'Есть', color: '#7FE0A8', alert: false }
      : { label: device.last_presence_minutes !== null ? `Нет · ${device.last_presence_minutes} мин` : 'Нет', color: '#5A5F58', alert: false };
  }
  if (device.type === 'leak_sensor') {
    const leaking = leakTel.value === 1;
    return { label: leaking ? 'Протечка!' : 'Сухо', color: leaking ? '#D9695F' : '#7FA98F', alert: leaking };
  }
  if (device.type === 'gate_controller') {
    const open = contactTel.value === 1;
    return { label: open ? 'Открыты' : 'Закрыты', color: open ? '#D9695F' : '#7FA98F', alert: open };
  }
  return null;
}

/* ── Main Component ────────────────────────────────────── */

export function DeviceTile({
  device,
  onToggle,
  onAdjustTemp,
  onSlider,
  onDetails,
}: {
  device: DeviceData;
  onToggle?: (id: string) => void;
  onAdjustTemp?: (id: string, delta: number) => void;
  onSlider?: (id: string, field: string, value: number) => void;
  onDetails?: (device: DeviceData) => void;
}) {
  const meta = DEVICE_TYPE_META[device.type];
  if (!meta) return null;
  const Icon = meta.icon;
  const ieee = device.ieee_addr;

  // Состояния из телеметрии
  const stateTel = getTelemetry(device, 'state');
  const temperatureTel = getTelemetry(device, 'temperature');
  const humidityTel = getTelemetry(device, 'humidity');
  const co2Tel = getTelemetry(device, 'co2');
  const vocTel = getTelemetry(device, 'voc');
  const powerTel = getTelemetry(device, 'power');
  const energyTel = getTelemetry(device, 'energy');
  const currentTel = getTelemetry(device, 'current');
  const brightnessTel = getTelemetry(device, 'brightness');
  const battery = device.battery ?? null;
  const linkquality = device.linkquality ?? null;

  const isOn = stateTel.value === 1;
  const isGate = device.type === 'gate_controller';
  const gateOpen = getTelemetry(device, 'contact').value === 1;
  const interactive = ['light', 'plug', 'gate_controller', 'climate'].includes(device.type);
  const status = getDeviceStatus(device);

  // Для air_monitor / temp_sensor / sensor — показываем метрики вместо статуса
  const showMetrics = ['air_monitor', 'temp_sensor', 'sensor'].includes(device.type);

  return (
    <div
      className="group relative min-h-[128px] bg-card border border-border rounded-2xl p-5 active:scale-[0.97] transition-all duration-200 touch-manipulation shadow-sm hover:shadow-md cursor-pointer select-none"
      onClick={() => onDetails?.(device)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onDetails?.(device); }}
    >
      {/* Top row: icon + name + toggle switch */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon size={24} strokeWidth={1.5} className="text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold text-text leading-tight truncate max-w-[160px]">
              {device.friendly_name || device.ieee_addr?.slice(0, 12)}
            </div>
            <div className="text-[11px] text-text-dim mt-0.5">{meta.label}</div>
          </div>
        </div>

        {interactive && device.type !== 'climate' && (
          <button
            className={'relative inline-flex h-7 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' + ((isGate ? gateOpen : isOn) ? 'bg-primary' : 'bg-border')}
            onClick={(e) => { e.stopPropagation(); onToggle?.(ieee); }}
            aria-label="переключить"
            role="switch"
            aria-checked={isGate ? gateOpen : isOn}
          >
            <span
              className={'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ' + ((isGate ? gateOpen : isOn) ? 'translate-x-4' : 'translate-x-0.5')}
            />
          </button>
        )}
      </div>

      {/* Body: status or metrics */}
      <div className="space-y-2">
        {showMetrics ? (
          <div>
            {/* Temperature + humidity row for air_monitor / temp_sensor / sensor */}
            <div className="flex items-center gap-4">
              {temperatureTel.value !== null && (
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-text tabular-nums leading-none">
                    {temperatureTel.value}°
                  </span>
                  <span className="text-[11px] text-text-dim font-medium">темп</span>
                </div>
              )}
              {humidityTel.value !== null && (
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-text tabular-nums leading-none">
                    {humidityTel.value}%
                  </span>
                  <span className="text-[11px] text-text-dim font-medium">влажн</span>
                </div>
              )}
            </div>

            {/* Extra metrics row for air_monitor */}
            {device.type === 'air_monitor' && (
              <div className="flex items-center gap-3 mt-1.5">
                {co2Tel.value !== null && (
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-sm font-semibold text-text">{co2Tel.value}</span>
                    <span className="text-[10px] text-text-dim uppercase tracking-wide">CO₂</span>
                  </div>
                )}
                {vocTel.value !== null && (
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-sm font-semibold text-text">{vocTel.value}</span>
                    <span className="text-[10px] text-text-dim uppercase tracking-wide">VOC</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : status ? (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold"
            style={{
              backgroundColor: status.alert ? `${status.color}15` : `${status.color}10`,
              color: status.color,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: status.color }} />
            {status.label}
          </div>
        ) : null}

        {/* Light brightness slider */}
        {device.type === 'light' && (
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                type="range" min={0} max={100}
                value={brightnessTel.value ?? 0}
                disabled={!isOn}
                onChange={(e) => onSlider?.(ieee, 'brightness', Number(e.target.value))}
                className="slider"
              />
            </div>
            <span className="font-mono text-sm font-semibold text-text tabular-nums min-w-[44px] text-right">
              {isOn ? `${brightnessTel.value ?? 0}%` : 'выкл'}
            </span>
          </div>
        )}

        {/* Plug metrics */}
        {device.type === 'plug' && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-surface-hover/50 rounded-lg p-2 text-center">
              <div className="font-mono text-sm font-bold text-text">{isOn ? `${powerTel.value ?? 0}` : '0'}</div>
              <div className="text-[10px] text-text-dim">Вт</div>
            </div>
            <div className="bg-surface-hover/50 rounded-lg p-2 text-center">
              <div className="font-mono text-sm font-bold text-text">{energyTel.value ?? 0}</div>
              <div className="text-[10px] text-text-dim">кВт·ч</div>
            </div>
            <div className="bg-surface-hover/50 rounded-lg p-2 text-center">
              <div className="font-mono text-sm font-bold text-text">{isOn ? `${currentTel.value ?? 0}` : '0'}</div>
              <div className="text-[10px] text-text-dim">А</div>
            </div>
          </div>
        )}

        {/* Climate controls */}
        {device.type === 'climate' && (
          <div className="flex items-center gap-2">
            <button
              className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-text font-bold text-lg active:bg-accent transition-colors"
              onClick={(e) => { e.stopPropagation(); onAdjustTemp?.(ieee, -0.5); }}
            >−</button>
            <span className="font-mono text-xl font-bold text-text tabular-nums min-w-[52px] text-center">
              {temperatureTel.value !== null ? `${temperatureTel.value}°` : '22°'}
            </span>
            <button
              className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-text font-bold text-lg active:bg-accent transition-colors"
              onClick={(e) => { e.stopPropagation(); onAdjustTemp?.(ieee, 0.5); }}
            >+</button>
            <span className="ml-auto text-xs font-medium text-text-dim">{isOn ? 'работает' : 'выкл'}</span>
          </div>
        )}
      </div>

      {/* Footer: battery + signal */}
      {(battery !== null || linkquality !== null) && (
        <div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-border/50">
          {battery !== null && (
            <span className="flex items-center gap-1.5 text-[11px] text-text-dim font-medium">
              <Battery size={13} strokeWidth={1.6} color={batteryColor(battery)} />
              <span style={{ color: batteryColor(battery) }}>{battery}%</span>
            </span>
          )}
          {linkquality !== null && (
            <span className="flex items-center gap-1.5 text-[11px] text-text-dim font-medium">
              <Signal size={13} strokeWidth={1.6} color="#5A5F58" />
              <span>{linkquality}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
