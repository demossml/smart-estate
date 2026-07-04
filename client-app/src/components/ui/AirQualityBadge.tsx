import { Thermometer, Droplets, Wind, AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react';

// ── Types ───────────────────────────────────────────────

interface AirQualityStat {
  property: string;
  label: string;
  value: number;
  unit: string;
  status: 'good' | 'warn' | 'danger';
  thresholds: { good: number; warn: number };
  tips: string[];
}

interface AirQualityData {
  device_ieee: string;
  device_name: string;
  room_name: string | null;
  overall: 'good' | 'warn' | 'danger';
  stats: AirQualityStat[];
  recommendations: string[];
}

interface AirQualityBadgeProps {
  data: AirQualityData;
}

// ── Helpers ─────────────────────────────────────────────

const STATUS_ORDER = { good: 0, warn: 1, danger: 2 };

const COLORS: Record<string, string> = {
  good:   'text-green border-green/30 bg-green/5',
  warn:   'text-yellow border-yellow/30 bg-yellow/5',
  danger: 'text-red border-red/30 bg-red/10',
};

const BG_COLORS: Record<string, string> = {
  good:   'bg-green/10 text-green',
  warn:   'bg-yellow/10 text-yellow',
  danger: 'bg-red/10 text-red',
};

function getStatusIcon(status: string, size = 16) {
  if (status === 'good') return <CheckCircle2 size={size} className="text-green" />;
  if (status === 'warn') return <CircleAlert size={size} className="text-yellow" />;
  return <AlertTriangle size={size} className="text-red" />;
}

// ── Свойства с особыми иконками ───────────────────────

const PROP_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  temperature: Thermometer,
  humidity: Droplets,
};

function getPropIcon(prop: string, status: string, size = 14) {
  const Icon = PROP_ICONS[prop];
  if (Icon) return <Icon size={size} className={`shrink-0 ${status === 'good' ? 'text-text-dim' : COLORS[status].split(' ')[0]}`} />;
  return null;
}

// ── Форматирование значения ───────────────────────────

function formatValue(prop: string, value: number): string {
  if (prop === 'temperature') return `${value.toFixed(1)}°`;
  if (prop === 'humidity') return `${value.toFixed(0)}%`;
  if (prop === 'co2') return `${value} ppm`;
  if (prop === 'voc') return `${value} ppb`;
  if (prop === 'formaldehyde') return value < 0.01 ? '<0.01' : value.toFixed(2);
  return String(value);
}

// ── Компонент ──────────────────────────────────────────

export function AirQualityBadge({ data }: AirQualityBadgeProps) {
  const isGood = data.overall === 'good';
  const isWarn = data.overall === 'warn';
  const isDanger = data.overall === 'danger';

  // Сортируем: сначала проблемные
  const sortedStats = [...data.stats].sort(
    (a, b) => STATUS_ORDER[b.status] - STATUS_ORDER[a.status]
  );

  return (
    <div className={`rounded-card border px-3 py-3 ${COLORS[data.overall]} transition-colors`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        {getStatusIcon(data.overall, 18)}
        <span className={`text-sm font-bold ${isGood ? 'text-green' : isWarn ? 'text-yellow' : 'text-red'}`}>
          {isGood ? 'Качество воздуха: отлично' :
           isWarn ? 'Качество воздуха: ухудшено' :
           'Качество воздуха: опасно'}
        </span>
      </div>

      {/* Parameters */}
      <div className="flex flex-col gap-1.5">
        {sortedStats.map(s => {
          const valColor = s.status === 'good' ? 'text-text' :
                           s.status === 'warn' ? 'text-yellow' : 'text-red';
          return (
            <div key={s.property} className="flex items-center gap-2 min-h-[28px]">
              {getPropIcon(s.property, s.status)}
              <span className="text-xs text-text-dim min-w-[80px]">{s.label}</span>
              <span className={`text-sm font-semibold font-mono ${valColor}`}>
                {formatValue(s.property, s.value)}
              </span>
              <span className="text-[10px] text-text-dim ml-auto">
                {s.status === 'good' ? 'норма' : s.status === 'warn' ? `>${s.thresholds.good}` : `>${s.thresholds.warn}`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      {data.recommendations.length > 0 && data.overall !== 'good' && (
        <div className="mt-2.5 pt-2.5 border-t border-current/10 space-y-1">
          {data.recommendations.map((tip, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs">
              <span className={`shrink-0 mt-0.5 ${isDanger ? 'text-red' : 'text-yellow'}`}>💡</span>
              <span className="text-text-dim">{tip}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
