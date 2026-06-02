import { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';

type Period = 'day' | 'week' | 'month';

const ENERGY_DATA: Record<Period, { total: number; trend: string; rooms: Record<string, number> }> = {
  day:   { total: 4.8, trend: '-12% от нормы', rooms: { 'Гостиная': 1.2, 'Кухня': 0.8, 'Спальня': 0.6, 'Ванная': 0.4 } },
  week:  { total: 32.4, trend: '-8% от нормы', rooms: { 'Гостиная': 8.4, 'Кухня': 5.6, 'Спальня': 4.2, 'Ванная': 2.8 } },
  month: { total: 142, trend: '-5% от нормы', rooms: { 'Гостиная': 36, 'Кухня': 24, 'Спальня': 18, 'Ванная': 12 } },
};

const CHART_HEIGHTS: Record<Period, number[]> = {
  day: [18, 16, 14, 13, 16, 28, 44, 62, 70, 66, 58, 52, 48, 50, 56, 68, 76, 72, 60, 46, 34, 28, 22, 20],
  week: [52, 48, 61, 55, 72, 64, 45],
  month: [44, 38, 42, 50, 58, 62, 54, 47, 43, 49, 57, 66, 72, 68, 60, 53, 45, 41, 46, 55, 63, 71, 76, 70, 62, 54, 48, 43, 39, 35],
};

export default function Analytics() {
  const [period, setPeriod] = useState<Period>('day');
  const [loading, setLoading] = useState(true);
  const data = ENERGY_DATA[period];

  useEffect(() => {
    setTimeout(() => setLoading(false), 500);
  }, []);

  return (
    <div className="p-4 pb-24 animate-fade-in">
      <header className="mb-4" style={{ minHeight: 64 }}>
        <h1 className="text-xl font-bold text-text flex items-center gap-2">
          <BarChart3 size={22} className="text-blue" />
          Аналитика
        </h1>
      </header>

      {/* Period filter */}
      <div className="flex gap-2 mb-4" role="tablist" aria-label="Период">
        {(['day', 'week', 'month'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2 rounded-btn text-sm font-medium transition-all tap-active min-h-[44px]
                       ${period === p ? 'bg-blue text-white' : 'bg-surface text-text-dim hover:text-text'}`}
            role="tab"
            aria-selected={period === p}
          >
            {{ day: 'День', week: 'Неделя', month: 'Месяц' }[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          {/* Chart area */}
          <div className="bg-surface rounded-card p-4 mb-4" style={{ minHeight: 200 }}>
            {/* Simulated line chart */}
            <div className="flex items-end gap-0.5 h-24 mb-4" aria-hidden="true">
              {CHART_HEIGHTS[period].map((h, i) => {
                return (
                  <div key={i} className="flex-1 bg-blue/30 rounded-sm"
                       style={{ height: `${h}%` }} />
                );
              })}
            </div>
            <div className="text-center">
              <span className="font-mono text-3xl font-bold text-text">{data.total}</span>
              <span className="text-text-dim ml-1">кВт·ч</span>
            </div>
            <p className="text-center text-sm text-green mt-1">{data.trend}</p>
          </div>

          {/* Per-room breakdown */}
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider mb-2 px-1">
            По комнатам
          </h2>
          <div className="space-y-2">
            {Object.entries(data.rooms).map(([room, val]) => {
              const pct = (val / data.total) * 100;
              return (
                <div key={room}
                     className="bg-surface rounded-card p-3 flex items-center gap-3 min-h-[56px]">
                  <span className="text-sm font-medium text-text w-24">{room}</span>
                  <div className="flex-1 bg-surface-hover rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-blue rounded-full transition-all duration-500"
                         style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-mono text-sm text-text w-20 text-right">{val} кВт·ч</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
