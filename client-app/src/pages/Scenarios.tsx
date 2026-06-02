import { useState, useEffect } from 'react';
import { Plus, Clock, ChevronDown } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import { api } from '../api/client';
import { logClient } from '../lib/logger';
import type { Scenario } from '../types';

const MOCK_SCENARIOS: Scenario[] = [
  { id: '1', name: 'Вечерний режим', trigger: 'Время 22:00', actions: ['Свет выкл', 'Охрана вкл'], active: true },
  { id: '2', name: 'Утро', trigger: 'Время 07:00', actions: ['Свет ON', 't° 22°C'], active: true },
  { id: '3', name: 'Ухожу', trigger: 'Геофенсинг', actions: ['Всё выкл', 'Охрана ON'], active: false },
];

export default function Scenarios() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setScenarios(await api.getScenarios());
        setOffline(false);
      } catch (error) {
        setOffline(true);
        setScenarios(MOCK_SCENARIOS);
        logClient('warn', 'Сценарии: API недоступен, включены mock-данные', error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleScenario = (id: string) => {
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  };

  return (
    <div className="p-4 pb-24 animate-fade-in">
      <header className="flex items-center justify-between mb-4" style={{ minHeight: 64 }}>
        <div>
          <h1 className="text-xl font-bold text-text">Сценарии</h1>
          {offline && <p className="text-xs text-yellow mt-1">офлайн — mock-данные</p>}
        </div>
      </header>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : (
        <div className="space-y-3">
          {scenarios.map(s => (
            <div key={s.id}
                 className="bg-surface rounded-card p-4 border border-surface-hover tap-active
                            min-h-[72px] transition-all"
                 onClick={() => toggleScenario(s.id)}
                 role="button" tabIndex={0}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${s.active ? 'bg-green' : 'bg-text-dim'}`} />
                  <span className="font-semibold text-text">{s.name}</span>
                </div>
                <span className="text-xs text-text-dim flex items-center gap-1">
                  <Clock size={12} /> {s.trigger}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {s.actions.map((a, i) => (
                  <span key={i} className="text-xs bg-surface-hover px-2 py-0.5 rounded-full text-text-dim">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create scenario button */}
      <button
        onClick={() => setShowBuilder(!showBuilder)}
        className="w-full mt-4 py-3 rounded-btn border-2 border-dashed border-surface-hover
                   text-text-dim font-semibold flex items-center justify-center gap-2
                   tap-active min-h-[48px] hover:border-blue hover:text-blue transition-colors"
      >
        <Plus size={20} />
        Новая сценария
      </button>

      {/* Builder */}
      {showBuilder && (
        <div className="mt-4 bg-surface rounded-card p-4 border border-blue/20 animate-fade-in">
          <h2 className="text-base font-bold text-text mb-3">Мастер создания</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-dim block mb-1">Триггер</label>
              <div className="flex items-center justify-between bg-surface-hover rounded-btn px-3 py-2.5 min-h-[48px]">
                <span className="text-sm text-text">Выберите триггер</span>
                <ChevronDown size={16} className="text-text-dim" />
              </div>
            </div>
            <div>
              <label className="text-xs text-text-dim block mb-1">Условие</label>
              <div className="flex items-center justify-between bg-surface-hover rounded-btn px-3 py-2.5 min-h-[48px]">
                <span className="text-sm text-text-dim">Необязательно</span>
                <ChevronDown size={16} className="text-text-dim" />
              </div>
            </div>
            <div>
              <label className="text-xs text-text-dim block mb-1">Действия</label>
              <div className="flex items-center justify-between bg-surface-hover rounded-btn px-3 py-2.5 min-h-[48px]">
                <span className="text-sm text-text">+ Добавить действие</span>
              </div>
            </div>
            <button className="w-full py-3 rounded-btn bg-blue text-white font-semibold
                               tap-active min-h-[48px] transition-all hover:brightness-110">
              Сохранить сценарий
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
