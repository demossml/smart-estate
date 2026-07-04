import { Thermometer, Droplets, Wind, FlaskConical, Wind as VocIcon, Zap } from 'lucide-react';

interface MetricData {
  value: number;
  status: string;
  room_name: string;
}

interface MetricsGridProps {
  metrics: Record<string, MetricData>;
  energyToday: number;
}

// ── Definitions ───────────────────────────────────────────

interface MetricDef {
  key: string;
  label: string;
  icon: React.FC<{ size?: number; className?: string }>;
  unit: string;
  format: (v: number) => string;
  thresholds: { good: number; warn: number };
}

const METRICS_DEFS: MetricDef[] = [
  { key: 'temperature', label: 'Температура', icon: Thermometer, unit: '°C',
    format: v => `${v.toFixed(1)}`, thresholds: { good: 24, warn: 28 } },
  { key: 'humidity', label: 'Влажность', icon: Droplets, unit: '%',
    format: v => `${v.toFixed(0)}`, thresholds: { good: 60, warn: 70 } },
  { key: 'co2', label: 'CO₂', icon: Wind, unit: 'ppm',
    format: v => `${v}`, thresholds: { good: 1000, warn: 2000 } },
  { key: 'formaldehyde', label: 'Формальдегид', icon: FlaskConical, unit: 'мг/м³',
    format: v => v < 0.01 ? '<0.01' : v.toFixed(2), thresholds: { good: 0.01, warn: 0.05 } },
  { key: 'voc', label: 'VOC', icon: VocIcon, unit: 'ppb',
    format: v => `${v}`, thresholds: { good: 65, warn: 220 } },
  { key: 'energy', label: 'Энергия', icon: Zap, unit: 'кВт·ч',
    format: v => `${v.toFixed(1)}`, thresholds: { good: 10, warn: 20 } },
];

const STATUS_COLORS: Record<string, string> = {
  good: 'text-green border-green/30',
  warn: 'text-yellow border-yellow/30',
  danger: 'text-red border-red/30',
};

const STATUS_BG: Record<string, string> = {
  good: 'bg-green/5',
  warn: 'bg-yellow/5',
  danger: 'bg-red/5',
};

const STATUS_DOT: Record<string, string> = {
  good: 'bg-green',
  warn: 'bg-yellow',
  danger: 'bg-red',
};

function getStatus(value: number, def: MetricDef): string {
  if (def.key === 'temperature') {
    if (value > def.thresholds.warn || value < 10) return 'danger';
    if (value > def.thresholds.good || value < 18) return 'warn';
    return 'good';
  }
  if (def.key === 'humidity') {
    if (value > def.thresholds.warn || value < 20) return 'danger';
    if (value > def.thresholds.good || value < 30) return 'warn';
    return 'good';
  }
  if (def.key === 'energy') return 'good';
  if (value > def.thresholds.warn) return 'danger';
  if (value > def.thresholds.good) return 'warn';
  return 'good';
}

function getStatusLabel(status: string, def: MetricDef): string {
  if (status === 'danger') {
    if (def.key === 'temperature') return 'высокая';
    if (def.key === 'formaldehyde') return 'опасно!';
    return 'критично';
  }
  if (status === 'warn') {
    if (def.key === 'temperature') return 'тепло';
    if (def.key === 'humidity') return 'сыро';
    if (def.key === 'co2') return 'душно';
    if (def.key === 'formaldehyde') return 'повышен';
    return 'тревога';
  }
  if (def.key === 'energy') return 'за сегодня';
  return 'норма';
}

// ── Component ─────────────────────────────────────────────

export function MetricsGrid({ metrics, energyToday }: MetricsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {METRICS_DEFS.map(def => {
        if (def.key === 'energy') {
          // Energy — special card
          return (
            <div key={def.key}
              className="bg-surface rounded-card p-3 border border-surface-hover transition-all">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className={`w-2 h-2 rounded-full bg-auto`} />
                <span className="text-[10px] text-text-dim uppercase tracking-wider">{def.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono text-text">
                  {def.format(energyToday)}
                </span>
                <span className="text-xs text-text-dim">{def.unit}</span>
              </div>
              <span className="text-[10px] text-auto">за сегодня</span>
            </div>
          );
        }

        const data = metrics[def.key];
        if (!data) {
          return (
            <div key={def.key}
              className="bg-surface rounded-card p-3 border border-surface-hover transition-all opacity-50">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-2 h-2 rounded-full bg-text-dim/30" />
                <span className="text-[10px] text-text-dim uppercase tracking-wider">{def.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono text-text-dim">—</span>
              </div>
              <span className="text-[10px] text-text-dim">нет данных</span>
            </div>
          );
        }

        const status = data.status || getStatus(data.value, def);
        const statusLabel = getStatusLabel(status, def);

        return (
          <div key={def.key}
            className={`bg-surface rounded-card p-3 border ${STATUS_COLORS[status] || 'border-surface-hover'} ${STATUS_BG[status] || ''} transition-all`}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className={`w-2 h-2 rounded-full ${STATUS_DOT[status] || 'bg-text-dim'}`} />
              <span className="text-[10px] text-text-dim uppercase tracking-wider">{def.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold font-mono ${status === 'danger' ? 'text-red' : status === 'warn' ? 'text-yellow' : 'text-text'}`}>
                {def.format(data.value)}
              </span>
              <span className="text-xs text-text-dim">{def.unit}</span>
            </div>
            <span className={`text-[10px] ${status === 'danger' ? 'text-red' : status === 'warn' ? 'text-yellow' : 'text-green'}`}>
              {statusLabel}{data.room_name ? ` · ${data.room_name}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
