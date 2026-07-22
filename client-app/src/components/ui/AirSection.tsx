import { AlertTriangle, CheckCircle2, CircleAlert, Lightbulb, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { RingChart } from './RingChart';
import { formatAirValue, getAirStatus, STATUS_COLORS, STATUS_EMOJI, getAirColor, TUYA_LABELS } from '../../lib/air-utils';

interface AirParam {
  property: string;
  label: string;
  value: number;
  unit: string;
  status: 'good' | 'warn' | 'danger';
  bar: number;
}

interface AirQualityData {
  overall: 'good' | 'warn' | 'danger';
  badge: string | null;
  params: AirParam[];
  recommendations: string[];
}

interface AirSectionProps {
  data: AirQualityData;
}

// ── Helpers ───────────────────────────────────────────────

const STATUS_COLORS_UI: Record<string, string> = {
  good: 'text-green border-green/30 bg-green/5',
  warn: 'text-yellow border-yellow/30 bg-yellow/5',
  danger: 'text-red border-red/30 bg-red/10',
};

const STATUS_TEXT: Record<string, string> = {
  good: 'text-green',
  warn: 'text-yellow',
  danger: 'text-red',
};

const STATUS_RING_COLORS: Record<string, string> = {
  good: '#30d588',
  warn: '#ff9f0a',
  danger: '#ff453a',
};

// Для колец — короткое имя
const RING_LABELS: Record<string, string> = {
  temperature: 'Темп',
  humidity: 'Влажн',
  co2: 'CO₂',
  voc: 'VOC',
  formaldehyde: 'CH₂O',
};

// ── Component ─────────────────────────────────────────────

export function AirSection({ data }: AirSectionProps) {
  if (!data || data.params.length === 0) return null;

  const isGood = data.overall === 'good';
  const isWarn = data.overall === 'warn';
  const isDanger = data.overall === 'danger';

  const [tipsOpen, setTipsOpen] = useState(false);

  const sortedParams = [...data.params].sort(
    (a: AirParam, b: AirParam) =>
      ({ good: 0, warn: 1, danger: 2 } as Record<string, number>)[b.status] -
      ({ good: 0, warn: 1, danger: 2 } as Record<string, number>)[a.status]
  );

  return (
    <div className="space-y-2">
      {/* Header alert */}
      <div className={`rounded-card px-3 py-2.5 ${STATUS_COLORS_UI[data.overall]} flex items-start gap-2`}>
        {isDanger ? (
          <AlertTriangle size={18} className="text-red shrink-0 mt-0.5" />
        ) : isWarn ? (
          <CircleAlert size={18} className="text-yellow shrink-0 mt-0.5" />
        ) : (
          <CheckCircle2 size={18} className="text-green shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-bold ${STATUS_TEXT[data.overall]}`}>
            {isGood ? 'Качество воздуха: отлично' :
             isWarn ? 'Качество воздуха: ухудшено' :
             'Качество воздуха: опасно'}
          </span>
          {data.badge && (
            <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-current/10">
              {data.badge}
            </span>
          )}
        </div>
      </div>

      {/* Ring grid — Apple Health style */}
      <div className="bg-surface/50 rounded-card px-4 py-4">
        <div className="grid grid-cols-4 gap-3">
          {sortedParams.map((p: AirParam) => {
            // Показываем ЦИФРУ (значение Tuya-индекса) в центре кольца + статус внизу
            // Для Tuya: CO₂ = "2", цвет кольца по статусу
            // Для температуры: "26°"
            const ringValue = p.property === 'temperature'
              ? `${Math.round(p.value)}°`
              : p.property === 'humidity'
                ? `${Math.round(p.value)}%`
                : `${p.value}`;
            return (
              <div key={p.property} className="flex flex-col items-center">
                <RingChart
                  value={p.bar}
                  size={52}
                  strokeWidth={4.5}
                  color={STATUS_RING_COLORS[p.status]}
                  trackColor="rgba(255,255,255,0.06)"
                  displayValue={ringValue}
                  label={RING_LABELS[p.property] || p.property}
                />
                <div className="flex items-center gap-1 mt-1">
                  <span
                    className={`w-1 h-1 rounded-full ${
                      p.status === 'danger' ? 'bg-red' : p.status === 'warn' ? 'bg-yellow' : 'bg-green'
                    }`}
                  />
                  <span className={`text-[8px] ${
                    p.status === 'danger' ? 'text-red' : p.status === 'warn' ? 'text-yellow' : 'text-green'
                  }`}>
                    {p.status === 'good' ? 'норма' : p.status === 'warn' ? '> нормы' : 'критично'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommendations — collapsible */}
      {data.recommendations.length > 0 && data.overall !== 'good' && (
        <div className="rounded-card overflow-hidden">
          <button
            onClick={() => setTipsOpen(!tipsOpen)}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-red/5 text-left"
          >
            <Lightbulb size={14} className={`shrink-0 ${isDanger ? 'text-red' : 'text-yellow'}`} />
            <span className={`text-xs font-semibold flex-1 ${isDanger ? 'text-red' : 'text-yellow'}`}>
              Рекомендации
            </span>
            <span className="text-[10px] text-text-dim">{tipsOpen ? 'скрыть' : `показать (${data.recommendations.length})`}</span>
            <ChevronDown size={14} className={`text-text-dim transition-transform duration-200 ${tipsOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className={`transition-all duration-200 overflow-hidden ${tipsOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="px-3 pb-2.5 space-y-1.5 bg-red/5">
              {data.recommendations.map((tip: string, i: number) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <span className="shrink-0 mt-0.5">{isDanger ? '🚨' : '💡'}</span>
                  <span className="text-text-dim">{tip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
