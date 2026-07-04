import React, { useState } from "react";
import { Check, X } from "lucide-react";
import { DEVICE_TYPES } from "./DeviceTile";

/* ---- AssignDiscoveredModal ---- */
interface AssignDiscoveredModalProps {
  device: any;
  rooms: any[];
  onClose: () => void;
  onConfirm: (data: { name: string; roomId: string }) => void;
}

export default function AssignDiscoveredModal({ device, rooms, onClose, onConfirm }: AssignDiscoveredModalProps) {
  const [name, setName] = useState(device.suggestedName || device.name || "");
  const [roomId, setRoomId] = useState(rooms[0]?.id || "");
  const meta = DEVICE_TYPES[device.type];
  const Icon = meta?.icon || (({ size }: any) => null);

  return (
    <div className="se-modal-overlay" onClick={onClose}>
      <div className="se-modal" onClick={(e) => e.stopPropagation()}>
        <div className="se-modal-head">
          <div className="se-modal-title">Найдено устройство</div>
          <button className="se-icon-btn" onClick={onClose}><X size={16} strokeWidth={1.8} /></button>
        </div>

        <div className="se-found-row">
          <div className="se-tile-icon"><Icon size={18} strokeWidth={1.6} /></div>
          <div>
            <div className="se-found-type">{meta?.label || "Устройство"}</div>
            <div className="se-found-ieee">{device.ieee}</div>
          </div>
        </div>

        <label className="se-field-label">Имя устройства</label>
        <input className="se-input" value={name} onChange={(e) => setName(e.target.value)} />

        <label className="se-field-label">Комната</label>
        <select className="se-input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          {rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        <button className="se-primary-btn" disabled={!name.trim() || !roomId} onClick={() => onConfirm({ name: name.trim(), roomId })}>
          <Check size={14} strokeWidth={2} /> Добавить в дом
        </button>
      </div>
    </div>
  );
}
