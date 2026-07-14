import React, { useState } from "react";
import { Check, X, Edit3 } from "lucide-react";
import { DEVICE_TYPES } from "./DeviceTile";

/* ---- AssignDiscoveredModal ---- */
interface AssignDiscoveredModalProps {
  device: any;
  rooms: any[];
  onClose: () => void;
  onConfirm: (data: { name: string; roomId: string }) => void;
}

export default function AssignDiscoveredModal({ device, rooms, onClose, onConfirm }: AssignDiscoveredModalProps) {
  // НОВАЯ ЛОГИКА (14.07.2026):
  // Модалка работает с ЛЮБЫМ устройством из списка /api/devices/pending:
  //   - Для новых (is_added=false): заголовок "Найдено устройство"
  //   - Для уже добавленных (is_added=true): заголовок "Редактировать устройство"
  // Имя предзаполняется из friendly_name (для добавленных — уже заданное имя)
  const [name, setName] = useState(device.suggestedName || device.name || device.friendly_name || "");
  const [roomId, setRoomId] = useState(device.roomId || rooms[0]?.id || "");
  const meta = DEVICE_TYPES[device.type] || DEVICE_TYPES[device.suggested_type];
  const Icon = meta?.icon || (({ size }: any) => null);
  const isEditing = device.is_added;

  return (
    <div className="se-modal-overlay" onClick={onClose}>
      <div className="se-modal" onClick={(e) => e.stopPropagation()}>
        <div className="se-modal-head">
          <div className="se-modal-title">{isEditing ? "Редактировать устройство" : "Найдено устройство"}</div>
          <button className="se-icon-btn" onClick={onClose}><X size={16} strokeWidth={1.8} /></button>
        </div>

        <div className="se-found-row">
          <div className="se-tile-icon"><Icon size={18} strokeWidth={1.6} /></div>
          <div>
            <div className="se-found-type">{meta?.label || device.suggested_type || "Устройство"}</div>
            <div className="se-found-ieee">{device.ieee_address || device.ieee}</div>
            {isEditing && <div className="se-found-status">✅ Уже добавлено</div>}
          </div>
        </div>

        <label className="se-field-label">Имя устройства</label>
        <input className="se-input" value={name} onChange={(e) => setName(e.target.value)} />

        <label className="se-field-label">Комната</label>
        <select className="se-input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">— Без комнаты —</option>
          {rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        <button className="se-primary-btn" disabled={!name.trim()} onClick={() => onConfirm({ name: name.trim(), roomId })}>
          {isEditing ? (
            <><Edit3 size={14} strokeWidth={2} /> Сохранить</>
          ) : (
            <><Check size={14} strokeWidth={2} /> Добавить в дом</>
          )}
        </button>
      </div>
    </div>
  );
}
