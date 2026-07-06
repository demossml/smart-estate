import { Thermometer, Droplets, Wind, FlaskConical, Wind as VocIcon, Zap } from 'lucide-react';
import { formatAirValue, getAirStatus, STATUS_COLORS, AIR_LABELS } from '../../lib/air-utils';

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
  format: (v: number) => string;
}

const METRICS_DEFS: MetricDef[] = [
  { key: 'temperature', label: 'Температура', icon: Thermometer,
    format: v => formatAirValue('temperature', v) },
  { key: 'humidity', label: 'Влажность', icon: Droplets,
    format: v => formatAirValue('humidity', v) },
  { key: 'co2', label: 'CO₂', icon: Wind,
    format: v => formatAirValue('co2', v) },
  { key: 'formaldehyde', label: 'Формальдегид', icon: FlaskConical,
    format: v => formatAirValue('formaldehyde', v) },
  { key: 'voc', label: 'VOC', icon: VocIcon,
    format: v => formatAirValue('voc', v) },
  { key: 'energy', label: 'Энергия', icon: Zap,
    format: v => `${v.toFixed(1)} кВт·ч` },
];

const STATUS_TAILWIND: Record<string, { border: string; bg: string; dot: string }> = {
  good:  { border: 'border-green/30', bg: 'bg-green/5', dot: 'bg-green' },
  warn:  { border: 'border-yellow/30', bg: 'bg-yellow/5', dot: 'bg-yellow' },
  danger:{ border: 'border-red/30', bg: 'bg-red/5', dot: 'bg-red' },
};

// ── Component ─────────────────────────────────────────────

export function MetricsGrid({ metrics, energyToday }: MetricsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {METRICS_DEFS.map(def => {
        if (def.key === 'energy') {
          return (
            <div key={def.key}
              className="bg-surface rounded-card p-3 border border-surface-hover transition-all">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-2 h-2 rounded-full bg-auto" />
                <span className="text-[10px] text-text-dim uppercase tracking-wider">{def.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono text-text">
                  {def.format(energyToday)}
                </span>
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

        const status: string = data.status || getAirStatus(def.key, data.value);
        const tailwind = STATUS_TAILWIND[status] || STATUS_TAILWIND.good;

        return (
          <div key={def.key}
            className={`bg-surface rounded-card p-3 border ${tailwind.border} ${tailwind.bg} transition-all`}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className={`w-2 h-2 rounded-full ${tailwind.dot}`} />
              <span className="text-[10px] text-text-dim uppercase tracking-wider">{def.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold font-mono ${status === 'danger' ? 'text-red' : status === 'warn' ? 'text-yellow' : 'text-text'}`}>
                {def.format(data.value)}
              </span>
            </div>
            <span className={`text-[10px] ${status === 'danger' ? 'text-red' : status === 'warn' ? 'text-yellow' : 'text-green'}`}>
              {status === 'good' ? 'норма' : status === 'warn' ? 'внимание' : 'опасно'}
              {data.room_name ? ` · ${data.room_name}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
