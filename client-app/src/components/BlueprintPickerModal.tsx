import { useState, useEffect, useCallback } from 'react';
import { X, Lightbulb, Wind, Lock, DoorClosed, Sparkles, Plus } from 'lucide-react';
import { api } from '../api/client';

interface Blueprint {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: string;
  category: string;
  tags: string[];
}

interface BlueprintPickerModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const BLUEPRINT_ICONS: Record<string, any> = {
  'lightbulb': Lightbulb,
  'wind': Wind,
  'lock': Lock,
  'door': DoorClosed,
};

export function BlueprintPickerModal({ open, onClose, onCreated }: BlueprintPickerModalProps) {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getBlueprints();
      setBlueprints(res.blueprints || []);
    } catch (e: any) {
      setError(e.message || 'Не удалось загрузить шаблоны');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleCreate = useCallback(async (name: string) => {
    setCreating(name);
    setError(null);
    try {
      await api.createFromBlueprint(name);
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Ошибка при создании сценария');
    }
    setCreating(null);
  }, [onCreated, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-md max-h-[85vh] bg-[var(--card-bg,#1e1e2a)] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col animate-slide-up shadow-2xl border-t border-white/5">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <div>
            <div className="text-[18px] font-semibold text-text flex items-center gap-2">
              <Sparkles size={16} className="text-accent" />
              Создать из шаблона
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">
              Выберите готовый сценарий
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/5 text-text-muted">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {loading && (
            <div className="text-center py-8 text-text-dim text-[13px]">
              Загрузка шаблонов...
            </div>
          )}

          {error && (
            <div className="glass-card p-3 text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl">
              {error}
            </div>
          )}

          {!loading && blueprints.length === 0 && !error && (
            <div className="text-center py-8 text-text-dim text-[13px]">
              Нет доступных шаблонов
            </div>
          )}

          {!loading && blueprints.map((bp) => {
            const Icon = BLUEPRINT_ICONS[bp.icon] || Lightbulb;
            const isCreating = creating === bp.name;

            return (
              <button
                key={bp.id}
                disabled={isCreating}
                onClick={() => handleCreate(bp.id)}
                className="w-full glass-card p-3.5 rounded-xl flex items-start gap-3 text-left transition-all
                  hover:bg-white/[0.06] active:scale-[0.98] disabled:opacity-50"
              >
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={16} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-text">{bp.displayName}</div>
                  <div className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{bp.description}</div>
                  {bp.tags && bp.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {bp.tags.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 rounded-full bg-white/5 text-[10px] text-text-dim">
                          {tag}
                        </span>
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
