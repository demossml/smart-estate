import { useState } from 'react';
import { X } from 'lucide-react';
import { ROOM_ICON_OPTIONS, getRoomIcon } from '../../lib/icon-map';
import type { RoomIconOption } from '../../lib/icon-map';

interface RoomAddModalProps {
  onClose: () => void;
  onCreate: (name: string, iconKey: string) => Promise<void>;
}

export function RoomAddModal({ onClose, onCreate }: RoomAddModalProps) {
  const [name, setName] = useState('');
  const [iconKey, setIconKey] = useState('armchair');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onCreate(name.trim(), iconKey);
    } catch (e: any) {
      setError(e.message || 'Ошибка создания');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-md bg-surface border border-surface-hover rounded-t-2xl sm:rounded-2xl p-5 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text">Новая комната</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-hover">
            <X size={20} className="text-text-dim" />
          </button>
        </div>

        {/* Name */}
        <label className="block text-xs text-text-dim mb-1">Название</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Например: Баня, Сад, Гараж"
          className="w-full bg-bg border border-surface-hover rounded-card px-3 py-2.5 text-text text-sm mb-4 outline-none focus:border-blue"
          autoFocus
        />

        {/* Icon grid 4×4 */}
        <label className="block text-xs text-text-dim mb-2">Иконка</label>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {ROOM_ICON_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const selected = iconKey === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setIconKey(opt.key)}
                className={`flex flex-col items-center gap-1 p-2 rounded-card transition-colors min-h-[56px]
                  ${selected
                    ? 'bg-blue/15 border border-blue/40 text-blue'
                    : 'bg-bg border border-surface-hover text-text-dim hover:border-blue/30'
                  }`}
                title={opt.label}
              >
                <Icon size={22} />
                <span className="text-[10px] leading-tight text-center">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {error && <p className="text-red text-sm mb-3">{error}</p>}

        {/* Submit */}
        <button
          onClick={handleCreate}
          disabled={!name.trim() || busy}
          className={`w-full min-h-[48px] rounded-btn font-semibold flex items-center justify-center transition-colors
            ${name.trim()
              ? 'bg-blue text-white tap-active'
              : 'bg-surface-hover text-text-dim cursor-not-allowed'
            }`}
        >
          {busy ? 'Создание…' : 'Добавить комнату'}
        </button>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="w-full mt-2 py-2.5 rounded-btn text-sm text-text-dim hover:text-text transition-colors"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
