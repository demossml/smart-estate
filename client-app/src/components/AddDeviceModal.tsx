import React, { useState } from "react";
import { Plus, X, ArrowLeft, Check, Loader2 } from "lucide-react";
import { DEVICE_TYPES } from "./DeviceTile";
import { ROOM_ICONS, ROOM_ICON_LIST } from "./RoomCard";

/* ———————————————————————— AddDeviceModal ———————————————————————— */
interface AddDeviceModalProps {
  rooms: any[];
  presetRoomId: string | null;
  onClose: () => void;
  onConfirm: (data: { type: string; name: string; roomMode: string; roomId: string; newRoomName: string; newRoomIcon: string }) => void;
}

export default function AddDeviceModal({ rooms, presetRoomId, onClose, onConfirm }: AddDeviceModalProps) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [roomMode, setRoomMode] = useState("existing");
  const [roomId, setRoomId] = useState(presetRoomId || rooms[0]?.id || "");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomIcon, setNewRoomIcon] = useState("hallway");
  const [discovering, setDiscovering] = useState(false);

  const canNext1 = !!type;
  const canNext2 = name.trim().length > 0 && (roomMode === "existing" ? !!roomId : newRoomName.trim().length > 0);

  const handleConfirm = () => {
    setDiscovering(true);
    setTimeout(() => {
      onConfirm({
        type: type!,
        name: name.trim(),
        roomMode,
        roomId,
        newRoomName: newRoomName.trim(),
        newRoomIcon,
      });
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
            <Loader2 size={26} strokeWidth={1.6} className="se-spin" color="#C9A24B" />
            <div className="se-discovering-text">Поиск устройства через MQTT…</div>
            <div className="se-discovering-sub">device_announce · Zigbee2MQTT</div>
          </div>
        ) : step === 1 ? (
          <>
            <div className="se-modal-sub">Выберите тип устройства</div>
            <div className="se-type-grid">
              {Object.entries(DEVICE_TYPES).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={key}
                    className={"se-type-btn" + (type === key ? " se-type-btn--active" : "")}
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
            />

            <label className="se-field-label">Комната</label>
            <div className="se-segmented se-segmented--modal">
              <button
                className={"pc-seg-btn" + (roomMode === "existing" ? " pc-seg-btn--active" : "")}
                onClick={() => setRoomMode("existing")}
              >
                Существующая
              </button>
              <button
                className={"pc-seg-btn" + (roomMode === "new" ? " pc-seg-btn--active" : "")}
                onClick={() => setRoomMode("new")}
              >
                Новая
              </button>
            </div>

            {roomMode === "existing" ? (
              <select className="se-input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                {rooms.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  className="se-input"
                  placeholder="Название новой комнаты"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                />
                <div className="se-icon-picker">
                  {ROOM_ICON_LIST.map((k) => {
                    const I = ROOM_ICONS[k];
                    return (
                      <button
                        key={k}
                        className={"se-icon-pick" + (newRoomIcon === k ? " se-icon-pick--active" : "")}
                        onClick={() => setNewRoomIcon(k)}
                      >
                        <I size={16} strokeWidth={1.6} />
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <button className="se-primary-btn" disabled={!canNext2} onClick={handleConfirm}>
              <Check size={14} strokeWidth={2} /> Добавить устройство
            </button>
          </>
        )}
      </div>
    </div>
  );
}
