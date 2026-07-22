import { useState, useEffect, useCallback, useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { ArrowLeft, Plus, Trash2, Lightbulb, Wind, Lock, Bell, Globe, Clock, Home, GripVertical } from 'lucide-react';
import { api } from '../api/client';

/* ── Types ── */

interface TriggerCondition {
  type: 'device' | 'schedule' | 'timer' | 'webhook';
  device?: string;
  property?: string;
  operator?: string;
  value?: number;
  cron?: string;
  time?: string;
  kind?: string;
  offset_minutes?: number;
  duration_ms?: number;
}

interface Action {
  type: string;
  device?: string;
  command?: string;
  payload?: any;
  message?: string;
  duration_ms?: number;
  room_id?: number;
  device_type?: string;
  mode?: string;
  url?: string;
  scenario_name?: string;
  condition?: any;
  then?: Action[];
  else?: Action[];
  delay_ms?: number;
}

interface ScenarioData {
  id: number;
  name: string;
  description: string;
  triggers_json: string;
  actions_json: string;
  conditions_json: string | null;
  active: boolean;
  run_mode: string;
  priority_level: number;
  cooldown_ms: number;
  debounce_ms: number;
  timeout_sec: number;
  enabled_house_modes: string;
  trigger_logic: 'ANY' | 'ALL';
}

/* ── Props ── */

interface Props {
  scenarioId: number;
  onBack: () => void;
  onSaved: () => void;
}

/* ── Helpers ── */

function tryParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json); } catch { return fallback; }
}

/* ── Main Component ── */

export default function ScenarioEditor({ scenarioId, onBack, onSaved }: Props) {
  const [scenario, setScenario] = useState<ScenarioData | null>(null);
  const [triggers, setTriggers] = useState<TriggerCondition[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getScenarios();
      const found = (res.scenarios || []).find((s: any) => s.id === scenarioId);
      if (found) {
        setScenario(found);
        setTriggers(tryParse(found.triggers_json, []));
        setActions(tryParse(found.actions_json, []));
      }
    } catch {}
    setLoading(false);
  }, [scenarioId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    if (!scenario) return;
    setSaving(true);
    try {
      await api.updateScenario(
        String(scenario.id),
        scenario.name,
        JSON.stringify(triggers),
        JSON.stringify(actions),
      );
      onSaved();
    } catch {}
    setSaving(false);
  }, [scenario, triggers, actions, onSaved]);

  if (loading) {
    return (
      <div className="p-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-text-muted text-[13px] mb-4">
          <ArrowLeft size={14} /> Назад
        </button>
        <div className="glass-card p-8 text-center text-text-dim">Загрузка...</div>
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="p-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-text-muted text-[13px] mb-4">
          <ArrowLeft size={14} /> Назад
        </button>
        <div className="glass-card p-8 text-center text-text-dim">Сценарий не найден</div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-32">
      {/* Back + Save */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-text-muted text-[13px]">
          <ArrowLeft size={14} /> Назад
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 rounded-xl bg-accent text-white text-[12px] font-medium
            hover:opacity-90 disabled:opacity-50 transition-all"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>

      {/* Name */}
      <input
        className="w-full bg-transparent text-[20px] font-[family-name:var(--font-cormorant)] font-semibold text-text
          outline-none placeholder:text-text-dim mb-1"
        placeholder="Название сценария"
        value={scenario.name}
        onChange={e => setScenario({ ...scenario, name: e.target.value })}
      />
      <input
        className="w-full bg-transparent text-[12px] text-text-muted outline-none placeholder:text-text-dim mb-5"
        placeholder="Описание (необязательно)"
        value={scenario.description || ''}
        onChange={e => setScenario({ ...scenario, description: e.target.value })}
      />

      {/* ── Settings ── */}
      <div className="glass-card rounded-xl p-3.5 mb-4">
        <div className="text-[11px] font-semibold text-text-dim uppercase tracking-wider mb-3">Настройки</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-text-dim">Run mode</span>
            <select
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-text outline-none"
              value={scenario.run_mode || 'single'}
              onChange={e => setScenario({ ...scenario, run_mode: e.target.value })}
            >
              <option value="single">Single</option>
              <option value="queued">Queued</option>
              <option value="restart">Restart</option>
              <option value="parallel">Parallel</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-text-dim">Приоритет</span>
            <select
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-text outline-none"
              value={scenario.priority_level ?? 0}
              onChange={e => setScenario({ ...scenario, priority_level: Number(e.target.value) })}
            >
              <option value={0}>0 — обычный</option>
              <option value={1}>1 — высокий</option>
              <option value={2}>2 — bypass override</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-text-dim">Cooldown (мс)</span>
            <input
              type="number"
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-text outline-none"
              value={scenario.cooldown_ms ?? 0}
              onChange={e => setScenario({ ...scenario, cooldown_ms: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-text-dim">Timeout (сек)</span>
            <input
              type="number"
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-text outline-none"
              value={scenario.timeout_sec ?? 0}
              onChange={e => setScenario({ ...scenario, timeout_sec: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>

      {/* ── Triggers ── */}
      <div className="glass-card rounded-xl p-3.5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Lightbulb size={14} className="text-accent" />
            <span className="text-[11px] font-semibold text-text-dim uppercase tracking-wider">Триггеры</span>
          </div>
          <button
            onClick={() => setTriggers(prev => [...prev, { type: 'device', device: '', property: '', operator: '>', value: 0 }])}
            className="p-1 rounded-lg hover:bg-accent/10 text-accent"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="space-y-2">
          {triggers.length === 0 && (
            <div className="text-[11px] text-text-dim text-center py-3">Нет триггеров. Добавьте хотя бы один.</div>
          )}
          {triggers.map((trig, i) => (
            <TriggerCard
              key={i}
              trigger={trig}
              index={i}
              onChange={(updated) => {
                const next = [...triggers];
                next[i] = updated;
                setTriggers(next);
              }}
              onDelete={() => setTriggers(prev => prev.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="glass-card rounded-xl p-3.5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wind size={14} className="text-accent" />
            <span className="text-[11px] font-semibold text-text-dim uppercase tracking-wider">Действия</span>
          </div>
          <button
            onClick={() => setActions(prev => [...prev, { type: 'device_command', device: '', command: '' }])}
            className="p-1 rounded-lg hover:bg-accent/10 text-accent"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="space-y-2">
          {actions.length === 0 && (
            <div className="text-[11px] text-text-dim text-center py-3">Нет действий. Добавьте хотя бы одно.</div>
          )}
          {actions.map((act, i) => (
            <DraggableActionCard
              key={`action-${i}`}
              index={i}
              action={act}
              onMove={(fromIdx, toIdx) => {
                const next = [...actions];
                const [moved] = next.splice(fromIdx, 1);
                next.splice(toIdx, 0, moved);
                setActions(next);
              }}
              onChange={(updated) => {
                const next = [...actions];
                next[i] = updated;
                setActions(next);
              }}
              onDelete={() => setActions(prev => prev.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>
        
        {/* Hidden drop zone at end */}
        {actions.length > 0 && (
          <ActionDropZone
            index={actions.length}
            onDrop={(fromIdx) => {
              const next = [...actions];
              const [moved] = next.splice(fromIdx, 1);
              next.splice(actions.length, 0, moved);
              setActions(next);
            }}
          />
        )}
      </div>

      {/* Active toggle */}
      <div className="glass-card rounded-xl p-3.5 flex items-center justify-between">
        <div>
          <div className="text-[13px] text-text">Активен</div>
          <div className="text-[10px] text-text-muted">Сценарий будет автоматически обрабатываться</div>
        </div>
        <button
          className={'switch' + (scenario.active ? ' switch--on' : '')}
          onClick={() => setScenario({ ...scenario, active: !scenario.active })}
        >
          <span className="switch-knob" />
        </button>
      </div>
    </div>
  );
}

/* ── Trigger Card ── */

interface TriggerCardProps {
  trigger: TriggerCondition;
  index: number;
  onChange: (t: TriggerCondition) => void;
  onDelete: () => void;
}

function TriggerCard({ trigger, index, onChange, onDelete }: TriggerCardProps) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[9px] text-text-dim uppercase font-mono">#{index + 1}</span>
        <select
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
          value={trigger.type}
          onChange={e => onChange({ ...trigger, type: e.target.value as any })}
        >
          <option value="device">Устройство</option>
          <option value="schedule">Расписание</option>
          <option value="timer">Таймер</option>
          <option value="webhook">Webhook</option>
        </select>
        <button onClick={onDelete} className="p-1 rounded hover:bg-red-500/10 text-text-dim">
          <Trash2 size={11} />
        </button>
      </div>

      {trigger.type === 'device' && (
        <div className="grid grid-cols-4 gap-1.5">
          <input
            className="col-span-2 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
            placeholder="Устройство (ieee или тип)"
            value={trigger.device || ''}
            onChange={e => onChange({ ...trigger, device: e.target.value })}
          />
          <input
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
            placeholder="Свойство"
            value={trigger.property || ''}
            onChange={e => onChange({ ...trigger, property: e.target.value })}
          />
          <div className="flex gap-1">
            <select
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-1 py-1 text-[11px] text-text outline-none"
              value={trigger.operator || '>'}
              onChange={e => onChange({ ...trigger, operator: e.target.value })}
            >
              <option value=">">{'>'}</option>
              <option value="<">{'<'}</option>
              <option value=">=">{'>='}</option>
              <option value="<=">{'<='}</option>
              <option value="=">=</option>
              <option value="!=">≠</option>
            </select>
            <input
              type="number"
              className="w-14 bg-white/5 border border-white/10 rounded-lg px-1 py-1 text-[11px] text-text outline-none"
              value={trigger.value ?? 0}
              onChange={e => onChange({ ...trigger, value: Number(e.target.value) })}
            />
          </div>
        </div>
      )}

      {trigger.type === 'schedule' && (
        <div className="grid grid-cols-2 gap-1.5">
          <select
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
            value={trigger.kind || 'cron'}
            onChange={e => onChange({ ...trigger, kind: e.target.value })}
          >
            <option value="cron">CRON</option>
            <option value="time">Время</option>
            <option value="sunset">Закат</option>
            <option value="sunrise">Рассвет</option>
          </select>
          {trigger.kind === 'cron' && (
            <input
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
              placeholder="*/5 * * * *"
              value={trigger.cron || ''}
              onChange={e => onChange({ ...trigger, cron: e.target.value })}
            />
          )}
          {trigger.kind === 'time' && (
            <input
              type="time"
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
              value={trigger.time || ''}
              onChange={e => onChange({ ...trigger, time: e.target.value })}
            />
          )}
          {(trigger.kind === 'sunset' || trigger.kind === 'sunrise') && (
            <input
              type="number"
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
              placeholder="Смещение (мин)"
              value={trigger.offset_minutes ?? 0}
              onChange={e => onChange({ ...trigger, offset_minutes: Number(e.target.value) })}
            />
          )}
        </div>
      )}

      {trigger.type === 'timer' && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-text-dim shrink-0">Длительность (мс):</span>
          <input
            type="number"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
            value={trigger.duration_ms ?? 0}
            onChange={e => onChange({ ...trigger, duration_ms: Number(e.target.value) })}
          />
        </div>
      )}

      {trigger.type === 'webhook' && (
        <input
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
          placeholder="URL webhook"
          value={trigger.device || ''}
          onChange={e => onChange({ ...trigger, device: e.target.value })}
        />
      )}
    </div>
  );
}

/* ── Action Card ── */

interface ActionCardProps {
  action: Action;
  index: number;
  onChange: (a: Action) => void;
  onDelete: () => void;
}

function ActionCard({ action, index, onChange, onDelete }: ActionCardProps) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[9px] text-text-dim uppercase font-mono">#{index + 1}</span>
        <select
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
          value={action.type}
          onChange={e => onChange({ ...action, type: e.target.value })}
        >
          <option value="device_command">Команда устройству</option>
          <option value="delay">Пауза</option>
          <option value="group_command">Групповая команда</option>
          <option value="notify">Уведомление</option>
          <option value="set_house_mode">Режим дома</option>
          <option value="call_scenario">Вызвать сценарий</option>
          <option value="webhook">Webhook</option>
          <option value="if_then_else">Если-Иначе</option>
        </select>
        <button onClick={onDelete} className="p-1 rounded hover:bg-red-500/10 text-text-dim">
          <Trash2 size={11} />
        </button>
      </div>

      {/* Optional delay before action */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[9px] text-text-dim">Задержка перед (мс):</span>
        <input
          type="number"
          className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
          value={action.delay_ms ?? 0}
          onChange={e => onChange({ ...action, delay_ms: Number(e.target.value) })}
        />
      </div>

      {action.type === 'device_command' && (
        <div className="flex gap-1.5">
          <input
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
            placeholder="Устройство (ieee)"
            value={action.device || ''}
            onChange={e => onChange({ ...action, device: e.target.value })}
          />
          <input
            className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
            placeholder="Команда (on/off...)"
            value={action.command || ''}
            onChange={e => onChange({ ...action, command: e.target.value })}
          />
        </div>
      )}

      {action.type === 'delay' && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-text-dim">Длительность (мс):</span>
          <input
            type="number"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
            value={action.duration_ms ?? 0}
            onChange={e => onChange({ ...action, duration_ms: Number(e.target.value) })}
          />
        </div>
      )}

      {action.type === 'group_command' && (
        <div className="flex gap-1.5">
          <input
            type="number"
            className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
            placeholder="Room ID"
            value={action.room_id ?? ''}
            onChange={e => onChange({ ...action, room_id: Number(e.target.value) })}
          />
          <input
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
            placeholder="Тип устройства"
            value={action.device_type || ''}
            onChange={e => onChange({ ...action, device_type: e.target.value })}
          />
          <input
            className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
            placeholder="Команда"
            value={action.command || ''}
            onChange={e => onChange({ ...action, command: e.target.value })}
          />
        </div>
      )}

      {action.type === 'notify' && (
        <input
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
          placeholder="Текст уведомления"
          value={action.message || ''}
          onChange={e => onChange({ ...action, message: e.target.value })}
        />
      )}

      {action.type === 'set_house_mode' && (
        <input
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
          placeholder="Режим дома (home/away/sleep/night)"
          value={action.mode || ''}
          onChange={e => onChange({ ...action, mode: e.target.value })}
        />
      )}

      {action.type === 'call_scenario' && (
        <input
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
          placeholder="Имя сценария"
          value={action.scenario_name || ''}
          onChange={e => onChange({ ...action, scenario_name: e.target.value })}
        />
      )}

      {action.type === 'webhook' && (
        <div className="flex gap-1.5">
          <select
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
            value={action.method || 'POST'}
            onChange={e => onChange({ ...action, method: e.target.value })}
          >
            <option value="POST">POST</option>
            <option value="GET">GET</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
          <input
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-text outline-none"
            placeholder="URL"
            value={action.url || ''}
            onChange={e => onChange({ ...action, url: e.target.value })}
          />
        </div>
      )}

      {action.type === 'if_then_else' && (
        <div className="text-[10px] text-text-dim italic">
          Условие и вложенные действия редактируются в JSON
        </div>
      )}
    </div>
  );
}

// ── Draggable Action Card (DnD wrapper) ──

const ITEM_TYPE = 'ACTION_CARD';

interface DraggableProps {
  index: number;
  action: Action;
  onMove: (fromIdx: number, toIdx: number) => void;
  onChange: (a: Action) => void;
  onDelete: () => void;
}

function DraggableActionCard({ index, action, onMove, onChange, onDelete }: DraggableProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag(() => ({
    type: ITEM_TYPE,
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [index]);

  const [, drop] = useDrop(() => ({
    accept: ITEM_TYPE,
    hover: (item: { index: number }, monitor) => {
      if (!ref.current) return;
      const dragIdx = item.index;
      const hoverIdx = index;
      if (dragIdx === hoverIdx) return;

      // Determine mouse position relative to the element
      const rect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (rect.bottom - rect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverClientY = clientOffset.y - rect.top;

      // Only perform move when mouse has crossed half of the item height
      if (dragIdx < hoverIdx && hoverClientY < hoverMiddleY) return;
      if (dragIdx > hoverIdx && hoverClientY > hoverMiddleY) return;

      onMove(dragIdx, hoverIdx);
      item.index = hoverIdx; // update dragged item's index for subsequent calculations
    },
  }), [index, onMove]);

  drag(drop(ref));

  return (
    <div
      ref={ref}
      className={'transition-all duration-150' + (isDragging ? ' opacity-30 scale-[0.97]' : '')}
    >
      <ActionCard
        action={action}
        index={index}
        onChange={onChange}
        onDelete={onDelete}
      />
    </div>
  );
}

// ── Action Drop Zone (end of list) ──

interface DropZoneProps {
  index: number;
  onDrop: (fromIdx: number) => void;
}

function ActionDropZone({ index, onDrop }: DropZoneProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isOver }, drop] = useDrop(() => ({
    accept: ITEM_TYPE,
    drop: (item: { index: number }) => {
      if (item.index !== index) {
        onDrop(item.index);
        item.index = index;
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }), [index, onDrop]);

  drop(ref);

  return (
    <div
      ref={ref}
      className={`h-2 rounded-lg transition-all duration-150 ${
        isOver ? 'h-10 bg-accent/20 border-2 border-dashed border-accent/40' : ''
      }`}
    />
  );
}
