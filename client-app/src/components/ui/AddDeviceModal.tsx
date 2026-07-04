import { useState } from 'react';
import {
  X, ArrowLeft, Plus, Check, Loader2,
  User, Activity, DoorClosed, DoorOpen, Droplets, Wind,
  Lightbulb, Plug as PlugIcon, Thermometer,
} from 'lucide-react';
import { DEVICE_TYPE_META } from './DeviceTile';
import { ROOM_ICONS } from './DeviceTile';

interface RoomData {
  id: number | string;
  name: string;
  icon?: string;
}

interface AddDeviceModalProps {
  rooms: RoomData[];
  presetRoomId?: number | string | null;
  onClose: () => void;
  onConfirm: (data: {
    type: string;
    name: string;
    roomId: number | string;
    newRoomName?: string;
    newRoomIcon?: string;
  }) => void;
}

export function AddDeviceModal({ rooms, presetRoomId, onClose, onConfirm }: AddDeviceModalProps) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState<number | string>(presetRoomId || rooms[0]?.id || '');
  const [discovering, setDiscovering] = useState(false);

  const typeEntries = Object.entries(DEVICE_TYPE_META);

  const canNext1 = !!type;
  const canNext2 = name.trim().length > 0 && !!roomId;

  const handleConfirm = () => {
    setDiscovering(true);
    setTimeout(() => {
      onConfirm({ type: type!, name: name.trim(), roomId });
    }, 1100);
  };

  return (
    <div className="se-modal-overlay" onClick={onClose}>
      <div className="se-modal" onClick={(e) => e.stopPropagation()}>
        <div className="se-modal-head">
          {step > 1 && !discovering && (
            <button className="se-icon-btn" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} strokeWidth={1.8} />
            </button>
          )}
          <div className="se-modal-title">Новое устройство</div>
          <button className="se-icon-btn" onClick={onClose}>
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        {discovering ? (
          <div className="se-discovering">
            <Loader2 size={26} strokeWidth={1.6} className="spin" color="#C9A24B" />
            <div className="se-discovering-text">Поиск устройства через MQTT…</div>
            <div className="se-discovering-sub">device_announce · Zigbee2MQTT</div>
          </div>
        ) : step === 1 ? (
          <>
            <div className="se-modal-sub">Выберите тип устройства</div>
            <div className="se-type-grid">
              {typeEntries.map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={key}
                    className={'se-type-btn' + (type === key ? ' se-type-btn--active' : '')}
                    onClick={() => setType(key)}
                  >
                    <Icon size={19} strokeWidth={1.5} />
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
            <button className="se-primary-btn" disabled={!canNext1} onClick={() => setStep(2)}>
              Далее
            </button>
          </>
        ) : (
          <>
            <div className="se-modal-sub">Название и расположение</div>

            <label className="se-field-label">Имя устройства</label>
            <input
              className="se-input"
              placeholder="Например, «Окно, кабинет»"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />

            <label className="se-field-label">Комната</label>
            <select
              className="se-input"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <button className="se-primary-btn" disabled={!canNext2} onClick={handleConfirm}>
              <Check size={14} strokeWidth={2} /> Добавить устройство
            </button>
          </>
        )}
      </div>
    </div>
  );
}
