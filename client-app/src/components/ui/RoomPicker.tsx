import { useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { getRoomIcon } from '../../lib/icon-map';

// ── Стандартные комнаты (всегда доступны для выбора) ──
const STANDARD_ROOMS = [
  { name: 'Гостиная', icon: 'armchair' },
  { name: 'Кухня',     icon: 'cooking-pot' },
  { name: 'Спальня',   icon: 'bed' },
  { name: 'Ванная',    icon: 'bath' },
  { name: 'Коридор',   icon: 'door-open' },
  { name: 'Улица',     icon: 'tree-pine' },
];

interface RoomOption {
  id: number | string;
  name: string;
  icon: string;
}

interface RoomPickerProps {
  /** Комнаты из БД (уже созданные пользователем) */
  rooms: RoomOption[];
  /** ID текущей выбранной комнаты */
  value: number | string;
  /** Выбор комнаты */
  onChange: (roomId: number, roomName: string) => void;
  /** Вызов создания новой комнаты */
  onCreateRoom: () => void;
}

export function RoomPicker({ rooms, value, onChange, onCreateRoom }: RoomPickerProps) {
  const [open, setOpen] = useState(false);

  // Собираем все опции: стандартные + кастомные
  const allOptions: { type: 'standard' | 'custom'; id: number | string; name: string; icon: string }[] = [
    ...STANDARD_ROOMS.map(r => {
      // Если стандартная комната уже создана в БД, берём её id
      const existing = rooms.find(ro => ro.name === r.name);
      return { type: 'standard' as const, id: existing?.id ?? r.name, name: r.name, icon: r.icon };
    }),
    // Кастомные комнаты — те, что есть в БД, но не из стандартного списка
    ...rooms
      .filter(r => !STANDARD_ROOMS.some(s => s.name === r.name))
      .map(r => ({ type: 'custom' as const, id: r.id, name: r.name, icon: r.icon })),
  ];

  // Дедупликация по имени (если стандартная + кастомная с тем же именем — оставляем одну)
  const seen = new Set<string>();
  const options = allOptions.filter(o => {
    if (seen.has(o.name)) return false;
    seen.add(o.name);
    return true;
  });

  const selected = options.find(o => o.id === value || o.name === value);

  return (
    <div className="relative mb-3">
      <label className="block text-xs text-text-dim mb-1">Комната</label>
      {/* Триггер */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full min-h-[44px] bg-bg border border-surface-hover rounded-card px-3 py-2.5 text-text text-sm
                   flex items-center justify-between gap-2 tap-active focus:border-blue transition-colors"
      >
        <span className="flex items-center gap-2">
          {selected && (() => { const Icon = getRoomIcon(selected.icon); return <Icon size={16} className="text-text-dim shrink-0" />; })()}
          <span className={selected ? '' : 'text-text-dim'}>{selected?.name || 'Выберите комнату'}</span>
        </span>
        <ChevronDown size={16} className={`text-text-dim transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Выпадающий список */}
      {open && (
        <>
          {/* Прозрачный бекдроп для закрытия */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-surface border border-surface-hover rounded-card
                          shadow-lg overflow-hidden max-h-64 overflow-y-auto animate-fade-in">
            <div className="py-1">
              {options.map((opt, i) => {
                const Icon = getRoomIcon(opt.icon);
                const isSelected = opt.id === value;
                return (
                  <button
                    key={`${opt.type}-${i}`}
                    onClick={() => {
                      // Для стандартных комнат без id в БД — передаём id=1 (дефолт)
                      const roomId = typeof opt.id === 'number' ? opt.id : 1;
                      onChange(roomId, opt.name);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 min-h-[48px] text-sm tap-active transition-colors
                      ${isSelected ? 'bg-blue/10 text-blue font-semibold' : 'text-text hover:bg-surface-hover'}`}
                  >
                    <Icon size={18} className={`shrink-0 ${isSelected ? 'text-blue' : 'text-text-dim'}`} />
                    <span className="flex-1 text-left truncate">{opt.name}</span>
                    {opt.type === 'custom' && (
                      <span className="text-[10px] text-text-dim bg-surface-hover px-1.5 py-0.5 rounded-full">своя</span>
                    )}
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-blue shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Разделитель */}
            <div className="border-t border-surface-hover" />

            {/* Кнопка добавить комнату */}
            <button
              onClick={() => { setOpen(false); onCreateRoom(); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[48px] text-sm text-blue tap-active
                         hover:bg-blue/5 transition-colors font-semibold"
            >
              <Plus size={18} />
              Добавить комнату
            </button>
          </div>
        </>
      )}
    </div>
  );
}
