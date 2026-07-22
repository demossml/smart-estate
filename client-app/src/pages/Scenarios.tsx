import { useState, useEffect } from 'react';
import { Plus, Clock, Trash2, X, ChevronDown, Layers } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import { ConditionCard } from '../components/scenario/ConditionCard';
import { ActionCard } from '../components/scenario/ActionCard';
import { api } from '../api/client';
import { logClient } from '../lib/logger';
import { buildTriggers, buildActions, parseTriggers, parseActions, describeCondition, describeAction } from '../lib/scenario-codec';
import type { Scenario, Device, Room } from '../types';
import type { BuilderState, Condition, Action } from '../types/scenario-builder';
import { EMPTY_BUILDER } from '../types/scenario-builder';

// ── Component ──────────────────────────────────────────

export default function Scenarios() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [builder, setBuilder] = useState<BuilderState>(EMPTY_BUILDER);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = async () => {
    try {
      const [s, d, rData] = await Promise.all([
        api.getScenarios(),
        api.getDevices().catch(() => [] as Device[]),
        api.getRooms().catch(() => ({ ok: true, rooms: [] })),
      ]);
      setScenarios(s);
      setDevices(d);
      setRooms((rData as any).rooms || []);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Toggle
  const toggle = async (id: string) => {
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
    try { await api.toggleScenario(id); }
    catch { setScenarios(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s)); }
  };

  // Delete
  const deleteScenario = async (id: string) => {
    setScenarios(prev => prev.filter(s => s.id !== id));
    setDeleteConfirm(null);
    try { await api.deleteScenario(id); }
    catch { load(); }
  };

  // Add condition
  const addCondition = () => {
    setBuilder(prev => ({
      ...prev,
      conditions: [...prev.conditions, { type: 'device', device: '', property: 'temperature', operator: '>', value: 0 }],
    }));
  };

  // Add action
  const addAction = (type: Action['type'] = 'device') => {
    const defaults: Record<Action['type'], Action> = {
      device: { type: 'device', device: '', command: 'ON' },
      group: { type: 'group', roomId: rooms[0]?.id || '', deviceType: 'light', command: 'ON' },
      delay: { type: 'delay', seconds: 60 },
      scenario: { type: 'scenario', scenarioId: '', enable: true },
    };
    setBuilder(prev => ({ ...prev, actions: [...prev.actions, defaults[type]] }));
  };

  // Edit existing scenario
  const startEdit = (s: Scenario) => {
    const { conditions, logic } = parseTriggers(s.triggers_json);
    const actions = parseActions(s.actions_json);
    setBuilder({ name: s.name, logic, conditions, actions });
    setEditId(s.id);
    setShowBuilder(true);
  };

  // Save
  const save = async () => {
    if (!builder.name || !builder.conditions.length || !builder.actions.length) return;
    setSaving(true);
    try {
      const triggers = buildTriggers(builder.conditions, builder.logic);
      const actions = buildActions(builder.actions);
      if (editId) {
        await api.updateScenario(editId, builder.name, triggers, actions);
      } else {
        await api.createScenario(builder.name, triggers, actions);
      }
      setShowBuilder(false);
      setEditId(null);
      setBuilder(EMPTY_BUILDER);
      await load();
    } catch (e) {
      logClient('warn', 'Сценарий не сохранён', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const canSave = builder.name.trim() && builder.conditions.length > 0 && builder.actions.length > 0;

  return (
    <div className="p-4 pb-24 animate-fade-in">
      <header className="flex items-center justify-between mb-4" style={{ minHeight: 64 }}>
        <div>
          <h1 className="text-xl font-bold text-text">Сценарии</h1>
          {offline && <p className="text-xs text-yellow mt-1">офлайн</p>}
        </div>
      </header>

      {/* ── List ─────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : (
        <div className="space-y-2">
          {scenarios.length === 0 && !showBuilder && (
            <div className="text-center py-8 text-text-dim text-sm">Нет сценариев. Создайте первый!</div>
          )}
          {scenarios.map(s => (
            <div key={s.id} className="bg-surface rounded-card border border-surface-hover overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
                <button onClick={() => toggle(s.id)}
                  className={`shrink-0 w-11 h-6 rounded-full transition-all flex items-center px-0.5
                    ${s.active ? 'bg-green' : 'bg-surface-hover'}`}
                  aria-label={s.active ? 'Выключить' : 'Включить'}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${s.active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                <div className="flex-1 min-w-0" onClick={() => startEdit(s)}>
                  <div className="text-sm font-semibold text-text truncate">{s.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-text-dim">{s.trigger}</span>
                  </div>
                </div>
                <button onClick={() => setDeleteConfirm(s.id)}
                  className="shrink-0 p-2 text-text-dim hover:text-red tap-active rounded-btn" aria-label="Удалить">
                  <Trash2 size={16} />
                </button>
              </div>
              {s.actions.length > 0 && (
                <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                  {s.actions.map((a, i) => (
                    <span key={i} className="text-[10px] bg-bg px-2 py-1 rounded-full text-text-dim">{a}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Delete confirm ───────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onClick={() => setDeleteConfirm(null)}>
          <div className="bg-surface rounded-card p-6 w-[280px] animate-fade-in"
            onClick={e => e.stopPropagation()}>
            <p className="text-sm text-text mb-4">Удалить сценарий?</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-btn bg-surface-hover text-text text-sm font-semibold">Отмена</button>
              <button onClick={() => deleteScenario(deleteConfirm)}
                className="flex-1 py-2.5 rounded-btn bg-red text-white text-sm font-semibold">Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add button ───────────────────────────── */}
      {!showBuilder && (
        <button onClick={() => setShowBuilder(true)}
          className="w-full mt-4 py-3 rounded-btn border-2 border-dashed border-surface-hover
                     text-text-dim font-semibold flex items-center justify-center gap-2
                     tap-active min-h-[48px] hover:border-blue hover:text-blue transition-colors">
          <Plus size={20} /> Новый сценарий
        </button>
      )}

      {/* ════════════════════════════════════════════
          BUILDER
          ════════════════════════════════════════════ */}
      {showBuilder && (
        <div className="mt-4 bg-surface rounded-card border border-blue/20 animate-fade-in overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <h2 className="text-base font-bold text-text flex items-center gap-2">
              <Layers size={18} className="text-blue" />
              {editId ? 'Редактирование' : 'Новый сценарий'}
            </h2>
            <button onClick={() => { setShowBuilder(false); setEditId(null); setBuilder(EMPTY_BUILDER); }}
              className="p-1 text-text-dim"><X size={20} /></button>
          </div>

          <div className="px-4 pb-4 space-y-4">
            {/* Name */}
            <div>
              <label className="text-xs text-text-dim block mb-1">Название</label>
              <input type="text" value={builder.name}
                onChange={e => setBuilder(p => ({ ...p, name: e.target.value }))}
                placeholder="Например: Приехал домой"
                className="w-full bg-bg rounded-btn px-3 py-2.5 text-sm text-text border border-surface-hover
                           min-h-[48px] focus:border-blue focus:outline-none" />
            </div>

            {/* Logic toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-dim">Срабатывает когда:</span>
              <button onClick={() => setBuilder(p => ({ ...p, logic: 'ANY' }))}
                className={`text-xs px-3 py-1 rounded-full font-semibold transition-colors ${builder.logic === 'ANY' ? 'bg-blue text-white' : 'bg-surface-hover text-text-dim'}`}>
                ЛЮБОЕ условие
              </button>
              <button onClick={() => setBuilder(p => ({ ...p, logic: 'ALL' }))}
                className={`text-xs px-3 py-1 rounded-full font-semibold transition-colors ${builder.logic === 'ALL' ? 'bg-blue text-white' : 'bg-surface-hover text-text-dim'}`}>
                ВСЕ условия
              </button>
            </div>

            {/* ── Conditions ──────────────────────── */}
            <div>
              <label className="text-xs text-text-dim block mb-2 font-semibold uppercase tracking-wider">
                ЕСЛИ
              </label>
              <div className="flex flex-col gap-2">
                {builder.conditions.map((c, i) => (
                  <ConditionCard key={i} index={i} condition={c}
                    devices={devices}
                    onChange={updated => setBuilder(prev => ({
                      ...prev,
                      conditions: prev.conditions.map((x, j) => j === i ? updated : x),
                    }))}
                    onDelete={() => setBuilder(prev => ({
                      ...prev,
                      conditions: prev.conditions.filter((_, j) => j !== i),
                    }))} />
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={addCondition}
                  className="flex-1 py-2 rounded-btn border border-dashed border-surface-hover text-xs text-text-dim
                             hover:border-blue hover:text-blue tap-active transition-colors">
                  + Условие (датчик)
                </button>
                <button onClick={() => setBuilder(prev => ({
                  ...prev,
                  conditions: [...prev.conditions, { type: 'time' as const, kind: 'sunset' }],
                }))}
                  className="flex-1 py-2 rounded-btn border border-dashed border-surface-hover text-xs text-text-dim
                             hover:border-blue hover:text-blue tap-active transition-colors">
                  + Условие (время)
                </button>
                <button onClick={() => setBuilder(prev => ({
                  ...prev,
                  conditions: [...prev.conditions, { type: 'state' as const, device: '', expectedState: 'closed' }],
                }))}
                  className="flex-1 py-2 rounded-btn border border-dashed border-surface-hover text-xs text-text-dim
                             hover:border-blue hover:text-blue tap-active transition-colors">
                  + Условие (состояние)
                </button>
              </div>
            </div>

            {/* ── Actions ─────────────────────────── */}
            <div>
              <label className="text-xs text-text-dim block mb-2 font-semibold uppercase tracking-wider">
                ТО
              </label>
              <div className="flex flex-col gap-2">
                {builder.actions.map((a, i) => (
                  <ActionCard key={i} index={i} action={a}
                    devices={devices} rooms={rooms} scenarios={scenarios}
                    onChange={updated => setBuilder(prev => ({
                      ...prev,
                      actions: prev.actions.map((x, j) => j === i ? updated : x),
                    }))}
                    onDelete={() => setBuilder(prev => ({
                      ...prev,
                      actions: prev.actions.filter((_, j) => j !== i),
                    }))} />
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={() => addAction('device')}
                  className="py-1.5 px-3 rounded-btn border border-dashed border-surface-hover text-xs text-text-dim
                             hover:border-blue hover:text-blue tap-active transition-colors">
                  + Устройство
                </button>
                <button onClick={() => addAction('group')}
                  className="py-1.5 px-3 rounded-btn border border-dashed border-surface-hover text-xs text-text-dim
                             hover:border-blue hover:text-blue tap-active transition-colors">
                  + Группа
                </button>
                <button onClick={() => addAction('delay')}
                  className="py-1.5 px-3 rounded-btn border border-dashed border-surface-hover text-xs text-text-dim
                             hover:border-blue hover:text-blue tap-active transition-colors">
                  + Пауза
                </button>
                <button onClick={() => addAction('scenario')}
                  className="py-1.5 px-3 rounded-btn border border-dashed border-surface-hover text-xs text-text-dim
                             hover:border-blue hover:text-blue tap-active transition-colors">
                  + Сценарий
                </button>
              </div>
            </div>

            {/* ── Preview ──────────────────────────── */}
            {builder.conditions.length > 0 && builder.actions.length > 0 && (
              <div className="bg-bg rounded-card px-3 py-2.5 border border-blue/10">
                <div className="text-[10px] text-text-dim mb-1 font-semibold uppercase tracking-wider">Предпросмотр</div>
                <div className="text-xs text-text leading-relaxed">
                  <span className="text-blue font-semibold">ЕСЛИ</span>{' '}
                  {builder.conditions.map((c, i) => (
                    <span key={i}>
                      {i > 0 && <span className="text-text-dim"> {builder.logic === 'ALL' ? 'И' : 'ИЛИ'} </span>}
                      {describeCondition(c, devices)}
                    </span>
                  ))}
                  {' '}
                  <span className="text-green font-semibold">→</span>{' '}
                  {builder.actions.map((a, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      {describeAction(a, devices, rooms)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Save / Cancel ────────────────────── */}
            <div className="flex gap-2">
              <button onClick={() => { setShowBuilder(false); setEditId(null); setBuilder(EMPTY_BUILDER); }}
                className="flex-1 py-3 rounded-btn bg-surface-hover text-text text-sm font-semibold tap-active">
                Отмена
              </button>
              <button onClick={save} disabled={saving || !canSave}
                className="flex-1 py-3 rounded-btn bg-blue text-white text-sm font-semibold
                           tap-active transition-all hover:brightness-110
                           disabled:opacity-40 disabled:cursor-not-allowed">
                {saving ? 'Сохранение…' : editId ? 'Обновить' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
