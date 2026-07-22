import { useState, useCallback } from 'react';
import { Plus, Trash2, Sparkles, FileText, Zap, Settings, X, Lightbulb, Lock, Wind, DoorClosed } from 'lucide-react';
import { api } from '../../api/client';

interface ScenarioData {
  id: number;
  name: string;
  description: string;
  triggers_json: string;
  actions_json: string;
  schedule_json: string | null;
  active: boolean;
  run_mode: string;
  priority_level: number;
}

function parseTriggerSummary(triggersJson: string): string {
  try {
    const parsed = JSON.parse(triggersJson);
    if (!Array.isArray(parsed) || parsed.length === 0) return '—';
    const parts = parsed.map((t: any) => {
      if (t.type === 'device' || t.type === undefined) {
        return `${t.device || '?'} ${t.property || ''} ${t.operator || '?'} ${t.value ?? ''}`;
      }
      if (t.type === 'schedule' || t.type === 'time') {
        if (t.cron) return `⏰ ${t.cron}`;
        if (t.kind === 'sunset') return `🌅 Закат${t.offset_minutes ? ` ${t.offset_minutes > 0 ? '+' : ''}${t.offset_minutes}мин` : ''}`;
        if (t.kind === 'sunrise') return `🌄 Рассвет${t.offset_minutes ? ` ${t.offset_minutes > 0 ? '+' : ''}${t.offset_minutes}мин` : ''}`;
        return `⏰ ${t.time || '?'}`;
      }
      if (t.type === 'timer') return `⏱ Таймер ${t.duration_ms ? `${t.duration_ms / 1000}с` : '?'}`;
      if (t.type === 'webhook') return `🌐 Webhook: ${t.url || '?'}`;
      return t.type || '?';
    });
    return parts.join(', ');
  } catch {
    return '—';
  }
}

function parseActionSummary(actionsJson: string): string {
  try {
    const parsed = JSON.parse(actionsJson);
    if (!Array.isArray(parsed) || parsed.length === 0) return '—';
    const labels: string[] = [];
    for (const a of parsed) {
      switch (a.type) {
        case 'device_command': case 'mqtt':
          labels.push(`📡 ${a.device || '?'} → ${a.command || '?'}`);
          break;
        case 'delay':
          labels.push(`⏳ ${(a.duration_ms || 0) / 1000}с`);
          break;
        case 'group': case 'group_command':
          labels.push(`👥 ${a.device_type || '?'} × ${a.command || '?'}`);
          break;
        case 'notify': case 'notification':
          labels.push(`🔔 ${(a.message || a.body || '').slice(0, 30)}`);
          break;
        case 'set_house_mode':
          labels.push(`🏠 Режим: ${a.mode || '?'}`);
          break;
        case 'call_scenario':
          labels.push(`📞 ${a.scenario_name || a.scene_name || '?'}`);
          break;
        case 'webhook':
          labels.push(`🌐 ${a.url || '?'}`);
          break;
        case 'if_then_else':
          labels.push(`🔀 Если...то...`);
          break;
        default:
          labels.push(a.type || '?');
      }
    }
    return labels.join(' | ');
  } catch {
    return '—';
  }
}

interface ScenariosTabProps {
  scenarios: ScenarioData[];
  onEdit?: (id: number) => void;
  onToggle?: (id: number) => void;
  onDelete?: (id: number) => void;
  onCreateEmpty?: () => void;
  onRefresh?: () => void;
}

const BP_ICONS: Record<string, any> = { 'lightbulb': Lightbulb, 'wind': Wind, 'lock': Lock, 'door': DoorClosed };

function BlueprintPickerInline({ onClose, onRefresh }: { onClose: () => void; onRefresh?: () => void }) {
  const [bpBlueprints, setBpBlueprints] = useState<any[]>([]);
  const [bpLoading, setBpLoading] = useState(false);
  const [bpCreating, setBpCreating] = useState<string | null>(null);
  const [bpError, setBpError] = useState<string | null>(null);

  const loadBlueprints = useCallback(async () => {
    setBpLoading(true);
    setBpError(null);
    try {
      const res = await api.getBlueprints();
      setBpBlueprints(res.blueprints || []);
    } catch (e: any) {
      setBpError(e.message || 'Не удалось загрузить шаблоны');
    }
    setBpLoading(false);
  }, []);

  const handleCreate = useCallback(async (blueprintId: string) => {
    setBpCreating(blueprintId);
    setBpError(null);
    try {
      await api.createFromBlueprint(blueprintId);
      onRefresh?.();
      onClose();
    } catch (e: any) {
      setBpError(e.message || 'Ошибка при создании сценария');
    }
    setBpCreating(null);
  }, [onRefresh, onClose]);

  if (bpBlueprints.length === 0 && !bpLoading && !bpError) {
    loadBlueprints();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md max-h-[85vh] bg-[var(--card-bg,#1e1e2a)] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col animate-slide-up shadow-2xl border-t border-white/5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <div>
            <div className="text-[18px] font-semibold text-text flex items-center gap-2">
              <Sparkles size={16} className="text-accent" />
              Создать из шаблона
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">Выберите готовый сценарий</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/5 text-text-muted">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {bpLoading && <div className="text-center py-8 text-text-dim text-[13px]">Загрузка шаблонов...</div>}
          {bpError && <div className="glass-card p-3 text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl">{bpError}</div>}
          {!bpLoading && bpBlueprints.length === 0 && !bpError && (
            <div className="text-center py-8 text-text-dim text-[13px]">Нет доступных шаблонов</div>
          )}
          {!bpLoading && bpBlueprints.map((bp: any) => {
            const Icon = BP_ICONS[bp.icon] || Lightbulb;
            const isCreating = bpCreating === bp.id;
            return (
              <button key={bp.id} disabled={isCreating} onClick={() => handleCreate(bp.id)}
                className="w-full glass-card p-3.5 rounded-xl flex items-start gap-3 text-left transition-all hover:bg-white/[0.06] active:scale-[0.98] disabled:opacity-50"
              >
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={16} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-text">{bp.displayName}</div>
                  <div className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{bp.description}</div>
                  {bp.tags && bp.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {bp.tags.map((tag: string) => (
                        <span key={tag} className="px-1.5 py-0.5 rounded-full bg-white/5 text-[10px] text-text-dim">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0 mt-1">
                  {isCreating ? (
                    <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Plus size={16} className="text-accent" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.25s ease-out; }
      `}</style>
    </div>
  );
}

export function ScenariosTab({ scenarios, onEdit, onToggle, onDelete, onCreateEmpty, onRefresh }: ScenariosTabProps) {
  const [showBlueprintModal, setShowBlueprintModal] = useState(false);

  const handleToggle = useCallback(async (id: number) => {
    try {
      await api.toggleScenario(String(id));
      onToggle?.(id);
    } catch {}
  }, [onToggle]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await api.deleteScenario(String(id));
      onDelete?.(id);
    } catch {}
  }, [onDelete]);

  return (
    <div className="p-4 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-[22px] font-[family-name:var(--font-cormorant)] text-text font-semibold">Сценарии</div>
        <span className="text-[11px] text-text-muted">{scenarios.length} шт.</span>
      </div>
      <div className="text-[12px] text-text-muted mb-4">Автоматизация умного дома</div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowBlueprintModal(true)}
          className="flex-1 glass-card py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-[13px] font-medium text-accent
            hover:bg-white/[0.06] active:scale-[0.98] transition-all"
        >
          <Sparkles size={14} />
          Из шаблона
        </button>
        <button
          onClick={onCreateEmpty}
          className="flex-1 glass-card py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-[13px] font-medium text-text
            hover:bg-white/[0.06] active:scale-[0.98] transition-all"
        >
          <Plus size={14} />
          Пустой
        </button>
      </div>

      {/* Scenario list */}
      <div className="space-y-2.5">
        {scenarios.length === 0 && (
          <div className="glass-card p-8 text-center text-text-dim">
            Нет сценариев. Создайте первый из шаблона.
          </div>
        )}

        {scenarios.map((s) => (
          <div
            key={s.id}
            className={'glass-card rounded-xl overflow-hidden' + (onEdit ? ' cursor-pointer' : '')}
            onClick={() => onEdit?.(s.id)}
          >
            {/* Toggle + name row */}
            <div className="flex items-center gap-3 px-3.5 py-3">
              <button
                className={'switch shrink-0' + (s.active ? ' switch--on' : '')}
                onClick={(e) => { e.stopPropagation(); handleToggle(s.id); }}
              >
                <span className="switch-knob" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-text truncate">{s.name}</div>
                {s.description && (
                  <div className="text-[11px] text-text-muted truncate mt-0.5">{s.description}</div>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-dim hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
            </div>

            {/* Details block */}
            <div className="px-3.5 pb-3 space-y-1">
              <div className="flex items-center gap-2 text-[10px] text-text-dim">
                <Zap size={10} className="shrink-0" />
                <span className="truncate">Триггеры: {parseTriggerSummary(s.triggers_json)}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-text-dim">
                <FileText size={10} className="shrink-0" />
                <span className="truncate">Действия: {parseActionSummary(s.actions_json)}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-text-dim">
                <Settings size={10} className="shrink-0" />
                <span>run_mode: {s.run_mode || 'single'}</span>
                <span className="mx-1">·</span>
                <span>priority: {s.priority_level || 0}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Blueprint picker modal — inlined component to avoid tree-shaking */}
      {showBlueprintModal && (
        <BlueprintPickerInline
          onClose={() => setShowBlueprintModal(false)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
