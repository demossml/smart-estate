import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';

interface ScenarioData {
  id: number;
  name: string;
  description: string;
  triggers_json: string;
  actions_json: string;
  schedule_json: string | null;
  active: boolean;
}

export function ScenariosTab() {
  const [scenarios, setScenarios] = useState<ScenarioData[]>([]);
  const [loading, setLoading] = useState(true);
  const [cond, setCond] = useState('');
  const [act, setAct] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.getScenarios();
      setScenarios(res.scenarios || []);
    } catch {
      setScenarios([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleScenario = useCallback(async (id: number) => {
    try {
      await api.toggleScenario(id);
      setScenarios(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
    } catch {}
  }, []);

  const deleteScenario = useCallback(async (id: number) => {
    try {
      await api.deleteScenario(id);
      setScenarios(prev => prev.filter(s => s.id !== id));
    } catch {}
  }, []);

  const addScenario = useCallback(async () => {
    try {
      await api.createScenario(cond, act);
      setCond('');
      setAct('');
      await load();
    } catch {}
  }, [cond, act, load]);

  if (loading) {
    return (
      <div className="p-4">
        <div className="text-[22px] font-[family-name:var(--font-cormorant)] text-text font-semibold mb-1">Сценарии</div>
        <div className="text-[12px] text-text-muted mb-4">IF-THEN правила движка автоматизации</div>
        <div className="glass-card p-8 text-center text-text-dim">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="text-[22px] font-[family-name:var(--font-cormorant)] text-text font-semibold mb-1">Сценарии</div>
      <div className="text-[12px] text-text-muted mb-4">IF-THEN правила движка автоматизации</div>

      <div className="se-scn-list">
        {scenarios.length === 0 && (
          <div className="glass-card p-8 text-center text-text-dim">
            Нет сценариев. Создайте первый.
          </div>
        )}
        {scenarios.map((s) => (
          <div key={s.id} className="se-scn-row">
            <button
              className={'switch' + (s.active ? ' switch--on' : '')}
              onClick={() => toggleScenario(s.id)}
            >
              <span className="switch-knob" />
            </button>
            <div className="se-scn-text">
              <span className="se-scn-if">ЕСЛИ</span> {s.name}{s.description ? `: ${s.description}` : ''}
            </div>
            <button className="se-icon-btn" onClick={() => deleteScenario(s.id)}>
              <Trash2 size={13} strokeWidth={1.8} />
            </button>
          </div>
        ))}
      </div>

      <div className="se-scn-add">
        <input
          className="se-input"
          placeholder="Условие: например, температура > 25°C"
          value={cond}
          onChange={(e) => setCond(e.target.value)}
        />
        <input
          className="se-input"
          placeholder="Действие: например, включить кондиционер"
          value={act}
          onChange={(e) => setAct(e.target.value)}
        />
        <button
          className="se-primary-btn"
          disabled={!cond.trim() || !act.trim()}
          onClick={addScenario}
        >
          <Plus size={14} strokeWidth={2} /> Добавить сценарий
        </button>
      </div>
    </div>
  );
}
