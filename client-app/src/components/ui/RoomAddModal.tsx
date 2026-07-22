import { useState, useCallback } from 'react';
import { X, Check, DoorOpen, Sofa, Bed, UtensilsCrossed, TreePine } from 'lucide-react';

const ROOM_ICONS: Record<string, { icon: React.FC<{ size?: number; strokeWidth?: number }>; label: string }> = {
  hallway: { icon: DoorOpen, label: 'Прихожая' },
  living: { icon: Sofa, label: 'Гостиная' },
  bedroom: { icon: Bed, label: 'Спальня' },
  kitchen: { icon: UtensilsCrossed, label: 'Кухня' },
  yard: { icon: TreePine, label: 'Двор' },
};
const ROOM_ICON_KEYS = Object.keys(ROOM_ICONS);

interface RoomAddModalProps {
  onClose: () => void;
  onCreate: (name: string, iconKey: string) => Promise<void>;
}

export function RoomAddModal({ onClose, onCreate }: RoomAddModalProps) {
  const [name, setName] = useState('');
  const [iconKey, setIconKey] = useState('living');
  const [busy, setBusy] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate(name.trim(), iconKey);
    } catch {}
    setBusy(false);
  }, [name, iconKey, onCreate, busy]);

  return (
    <div className="se-modal-overlay" onClick={onClose}>
      <div className="se-modal" onClick={(e) => e.stopPropagation()}>
        <div className="se-modal-head">
          <div className="se-modal-title">Новая комната</div>
          <button className="se-icon-btn" onClick={onClose}>
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <label className="se-field-label">Название</label>
        <input
          className="se-input"
          placeholder="Например, «Терраса»"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label className="se-field-label">Иконка</label>
        <div className="se-icon-picker">
          {ROOM_ICON_KEYS.map((k) => {
            const I = ROOM_ICONS[k].icon;
            return (
              <button
                key={k}
                className={'se-icon-pick' + (iconKey === k ? ' se-icon-pick--active' : '')}
                onClick={() => setIconKey(k)}
                title={ROOM_ICONS[k].label}
              >
                <I size={16} strokeWidth={1.6} />
              </button>
            );
          })}
        </div>

        <button
          className="se-primary-btn"
          disabled={!name.trim() || busy}
          onClick={handleCreate}
        >
          <Check size={14} strokeWidth={2} /> {busy ? 'Создание…' : 'Создать комнату'}
        </button>
      </div>
    </div>
  );
}
