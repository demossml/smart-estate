import { useEffect, useState } from 'react';
import { Thermometer, Flame, Snowflake, Power } from 'lucide-react';
import { api } from '../api/client';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/StatusBadge';
import { logClient } from '../lib/logger';
import type { ClimateSetpoint } from '../types';

const MOCK_CLIMATE: ClimateSetpoint[] = [
  { id: 'cl-1', name: 'Термостат гостиная', room: 'Гостиная', currentTemp: 21.5, targetTemp: 22, mode: 'auto', online: true },
  { id: 'cl-2', name: 'Спальня', room: 'Спальня', currentTemp: 20.1, targetTemp: 20, mode: 'heat', online: true },
  { id: 'cl-3', name: 'Котельная', room: 'Техзона', currentTemp: 18.8, targetTemp: 19, mode: 'off', online: false },
];

const modeLabels = { heat: 'Обогрев', cool: 'Охлажд.', auto: 'Авто', off: 'Выкл' };
const modeIcons = { heat: Flame, cool: Snowflake, auto: Thermometer, off: Power };

export default function Climate() {
  const [items, setItems] = useState<ClimateSetpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setItems(await api.getClimate());
        setOffline(false);
      } catch (error) {
        setOffline(true);
        setItems(MOCK_CLIMATE);
        logClient('warn', 'Климат: API недоступен, включены mock-данные', error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const updateTarget = (id: string, targetTemp: number) => {
    let prevMode: ClimateSetpoint['mode'] = 'auto';
    setItems(prev => {
      const item = prev.find(v => v.id === id);
      if (item) prevMode = item.mode;
      return prev.map(item => item.id === id ? { ...item, targetTemp } : item);
    });
    window.setTimeout(() => {
      api.updateClimate(id, targetTemp, prevMode).catch(error => {
        logClient('warn', 'Не удалось обновить климат', error instanceof Error ? error.message : String(error));
      });
    }, 400);
  };

  const setMode = (id: string, mode: ClimateSetpoint['mode']) => {
    let prevTemp = 21;
    setItems(prev => {
      const item = prev.find(v => v.id === id);
      if (item) prevTemp = item.targetTemp;
      return prev.map(item => item.id === id ? { ...item, mode } : item);
    });
    api.updateClimate(id, prevTemp, mode).catch(error => {
      logClient('warn', 'Не удалось сменить режим климата', error instanceof Error ? error.message : String(error));
    });
  };

  return (
    <div className="p-4 pb-24 animate-fade-in">
      <header className="mb-4" style={{ minHeight: 64 }}>
        <h1 className="text-xl font-bold text-text flex items-center gap-2">
          <Thermometer size={22} className="text-blue" />
          Климат
        </h1>
        {offline && <p className="text-xs text-yellow mt-1">офлайн — mock-данные</p>}
      </header>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}</div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const ModeIcon = modeIcons[item.mode];
            return (
              <section key={item.id} className="bg-surface rounded-card p-4 border border-surface-hover">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="font-semibold text-text">{item.name}</h2>
                    <p className="text-xs text-text-dim">{item.room}</p>
                  </div>
                  <StatusBadge status={item.online ? 'online' : 'offline'} />
                </div>
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <div className="text-xs text-text-dim">Сейчас</div>
                    <div className="font-mono text-2xl font-bold">{item.currentTemp.toFixed(1)}°</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-text-dim">Цель</div>
                    <div className="font-mono text-3xl font-bold text-blue">{item.targetTemp.toFixed(1)}°</div>
                  </div>
                </div>
                <input
                  type="range"
                  min="16"
                  max="28"
                  step="0.5"
                  value={item.targetTemp}
                  onChange={event => updateTarget(item.id, Number(event.target.value))}
                  className="w-full accent-blue"
                  aria-label={`Температура ${item.name}`}
                />
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {(['auto', 'heat', 'cool', 'off'] as ClimateSetpoint['mode'][]).map(mode => {
                    const Icon = modeIcons[mode];
                    return (
                      <button
                        key={mode}
                        onClick={() => setMode(item.id, mode)}
                        className={`min-h-[44px] rounded-btn text-xs font-semibold flex flex-col items-center justify-center gap-1
                                   ${item.mode === mode ? 'bg-blue text-white' : 'bg-surface-hover text-text-dim'}`}
                      >
                        <Icon size={16} />
                        {modeLabels[mode]}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 text-xs text-text-dim flex items-center gap-1">
                  <ModeIcon size={14} />
                  Режим: {modeLabels[item.mode]}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
