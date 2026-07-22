import React, { useState } from "react";
import { X, Check } from "lucide-react";
import { ROOM_ICONS, ROOM_ICON_LIST } from "./HomeWidgets";

/* ———————————————————————— AddRoomModal ———————————————————————— */
interface AddRoomModalProps {
  onClose: () => void;
  onConfirm: (data: { name: string; icon: string }) => void;
  room?: any; // если передан — режим редактирования
}

export default function AddRoomModal({ onClose, onConfirm, room }: AddRoomModalProps) {
  const [name, setName] = useState(room?.name || "");
  const [icon, setIcon] = useState(room?.icon || "hallway");
  const isEdit = !!room;

  return (
    <div className="se-modal-overlay" onClick={onClose}>
      <div className="se-modal" onClick={(e) => e.stopPropagation()}>
        <div className="se-modal-head">
          <div className="se-modal-title">{isEdit ? "Редактировать комнату" : "Новая комната"}</div>
          <button className="se-icon-btn" onClick={onClose}>
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>
        <label className="se-field-label">Название</label>
        <input className="se-input" placeholder="Например, «Терраса»" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="se-field-label">Иконка</label>
        <div className="se-icon-picker">
          {ROOM_ICON_LIST.map((k) => {
            const I = ROOM_ICONS[k];
            return (
              <button
                key={k}
                className={"se-icon-pick" + (icon === k ? " se-icon-pick--active" : "")}
                onClick={() => setIcon(k)}
              >
                <I size={16} strokeWidth={1.6} />
              </button>
            );
          })}
        </div>
        <button
          className="se-primary-btn"
          disabled={!name.trim()}
          onClick={() => onConfirm({ name: name.trim(), icon })}
        >
          <Check size={14} strokeWidth={2} /> {isEdit ? "Сохранить" : "Создать комнату"}
        </button>
      </div>
    </div>
  );
}
