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
  // Для toggleable устройств — состояние из телеметрии
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
  const contactTel = getTelemetry(device, 'contact');
  const presenceTel = getTelemetry(device, 'presence');
  const leakTel = getTelemetry(device, 'water_leak');
  const brightnessTel = getTelemetry(device, 'brightness');
  const temperatureTel = getTelemetry(device, 'temperature');
  const humidityTel = getTelemetry(device, 'humidity');
  const co2Tel = getTelemetry(device, 'co2');
  const vocTel = getTelemetry(device, 'voc');
  const powerTel = getTelemetry(device, 'power');
  const energyTel = getTelemetry(device, 'energy');
  const currentTel = getTelemetry(device, 'current');
  const battery = device.battery ?? null;
  const linkquality = device.linkquality ?? null;

  const isOn = stateTel.value === 1;
  const contactOpen = contactTel.value === 1;
  const presenceOn = presenceTel.value === 1;
  const leakOn = leakTel.value === 1;
  const isGate = device.type === 'gate_controller';
  const gateOpen = contactTel.value === 1;
  const interactive = ['light', 'plug', 'gate_controller', 'climate'].includes(device.type);

  return (
    <div className={'se-tile' + (interactive ? ' se-tile--interactive' : '')} onClick={() => onDetails?.(device)}>
      {/* Top row: icon + name + switch */}
      <div className="se-tile-top">
        <div className="se-tile-icon">
          <Icon size={16} strokeWidth={1.6} />
        </div>
        <div className="se-tile-name">{device.friendly_name || device.ieee_addr?.slice(0, 12)}</div>
        {interactive && device.type !== 'climate' && (
          <button
            className={'switch' + ((isGate ? gateOpen : isOn) ? ' switch--on' : '')}
            onClick={() => onToggle?.(ieee)}
            aria-label="переключить"
          >
            <span className="switch-knob" />
          </button>
        )}
      </div>

      {/* Body: type-specific data display */}
      <div className="se-tile-body">
        {/* Window / Door */}
        {(device.type === 'window_sensor' || device.type === 'door_sensor') && (
          <span className={'se-badge' + (contactOpen ? ' se-badge--alert' : '')}>
            {contactOpen ? 'Открыто' : 'Закрыто'}
          </span>
        )}

        {/* Presence / Motion */}
        {(device.type === 'presence_sensor' || device.type === 'motion_sensor') && (
          <span className={'se-badge' + (presenceOn ? ' se-badge--ok' : '')}>
            {presenceOn
              ? 'Есть'
              : device.last_presence_minutes !== null && device.last_presence_minutes !== undefined
                ? `Нет · ${device.last_presence_minutes} мин`
                : 'Нет'}
          </span>
        )}

        {/* Leak */}
        {device.type === 'leak_sensor' && (
          <span className={'se-badge' + (leakOn ? ' se-badge--alert' : ' se-badge--ok')}>
            {leakOn ? 'Протечка!' : 'Сухо'}
          </span>
        )}

        {/* Air monitor */}
        {device.type === 'air_monitor' && (
          <div className="se-air-grid">
            <div><span className="se-mono">{temperatureTel.value !== null ? `${temperatureTel.value}°` : '—'}</span><label>темп.</label></div>
            <div><span className="se-mono">{humidityTel.value !== null ? `${humidityTel.value}%` : '—'}</span><label>влажн.</label></div>
            <div><span className="se-mono">{co2Tel.value !== null ? co2Tel.value : '—'}</span><label>CO₂</label></div>
            <div><span className="se-mono">{vocTel.value !== null ? vocTel.value : '—'}</span><label>VOC</label></div>
          </div>
        )}

        {/* Light */}
        {device.type === 'light' && (
          <div className="se-light-row">
            <input
              type="range" min={0} max={100}
              value={brightnessTel.value ?? 0}
              disabled={!isOn}
              onChange={(e) => onSlider?.(ieee, 'brightness', Number(e.target.value))}
              className="slider se-slider--sm"
            />
            <span className="se-mono">{isOn ? `${brightnessTel.value ?? 0}%` : 'выкл'}</span>
          </div>
        )}

        {/* Plug */}
        {device.type === 'plug' && (
          <div className="se-air-grid se-air-grid--3">
            <div><span className="se-mono">{isOn ? `${powerTel.value ?? 0} Вт` : '0 Вт'}</span><label>мощн.</label></div>
            <div><span className="se-mono">{energyTel.value ?? 0} кВт·ч</span><label>сегодня</label></div>
            <div><span className="se-mono">{isOn ? `${currentTel.value ?? 0} А` : '0 А'}</span><label>ток</label></div>
          </div>
        )}

        {/* Gate */}
        {device.type === 'gate_controller' && (
          <span className={'se-badge' + (gateOpen ? ' se-badge--alert' : ' se-badge--ok')}>
            {gateOpen ? 'Открыты' : 'Закрыты'}
          </span>
        )}

        {/* Climate */}
        {device.type === 'climate' && (
          <div className="se-climate-row">
            <button className="se-temp-btn" onClick={() => onAdjustTemp?.(ieee, -0.5)}>−</button>
            <span className="se-mono se-climate-temp">{temperatureTel.value !== null ? `${temperatureTel.value}°` : '22°'}</span>
            <button className="se-temp-btn" onClick={() => onAdjustTemp?.(ieee, 0.5)}>+</button>
            <span className="se-badge" style={{ marginLeft: 'auto' }}>
              {isOn ? 'работает' : 'выкл'}
            </span>
          </div>
        )}
      </div>

      {/* Footer: battery + signal */}
      {(battery !== null || linkquality !== null) && (
        <div className="se-tile-foot">
          {battery !== null && (
            <span className="se-mini-metric">
              <Battery size={11} strokeWidth={1.6} color={batteryColor(battery)} />
              <span style={{ color: batteryColor(battery) }}>{battery}%</span>
            </span>
          )}
          {linkquality !== null && (
            <span className="se-mini-metric">
              <Signal size={11} strokeWidth={1.6} color="#5A5F58" />
              <span>{linkquality}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
