import React, { useState } from "react";
import { Check, X, Edit3, HelpCircle } from "lucide-react";
import { DEVICE_TYPES } from "./DeviceTile";

/* ———— Все возможные типы устройств ———— */
const ALL_TYPES = Object.keys(DEVICE_TYPES);

/* ———— Форматирование имени ———— */
function suggestName(device: any): string {
  const raw = device.suggestedName || device.name || device.friendly_name || "";
  // Если имя уже человеческое — оставляем
  if (raw && !raw.startsWith("0x") && !raw.startsWith("Новый Датчик")) return raw;
  // Пробуем сгенерировать красивое имя по модели
  const model = device.model || device.model_id || "";
  if (model) {
    // Убираем префиксы брендов (Tuya, LUMI, etc)
    const clean = model
      .replace(/^(TS\d+|lumi\.|Zigbee|TZ\d+)/i, "")
      .replace(/[-_]/g, " ")
      .trim();
    if (clean.length > 2) return clean;
  }
  // По типу
  const meta = DEVICE_TYPES[device.suggested_type || device.type];
  if (meta) return `Новый ${meta.label}`;
  // Последняя надежда — часть ieee
  const ieee = device.ieee_address || device.ieee || "";
  return ieee ? `Датчик ${ieee.slice(-8).toUpperCase()}` : "Новое устройство";
}

/* ———— AssignDiscoveredModal ———— */
interface AssignDiscoveredModalProps {
  device: any;
  rooms: any[];
  onClose: () => void;
  onConfirm: (data: { name: string; roomId: string; type: string | null }) => void;
}

export default function AssignDiscoveredModal({ device, rooms, onClose, onConfirm }: AssignDiscoveredModalProps) {
  // НОВАЯ ЛОГИКА (14.07.2026):
  // Модалка работает с ЛЮБЫМ устройством из списка /api/devices/pending:
  //   - Для новых (is_added=false): заголовок "Новое устройство", кнопка "Добавить в дом"
  //   - Для уже добавленных (is_added=true): заголовок "Редактировать устройство", кнопка "Сохранить изменения"
  const [name, setName] = useState(suggestName(device));
  const [roomId, setRoomId] = useState(device.roomId || device.room_id || "");
  const isEditing = device.is_added;

  // Устройство без типа
  const noType = !device.suggested_type && !device.type;
  const [selectedType, setSelectedType] = useState(device.suggested_type || device.type || ALL_TYPES[0]);

  // Отображаемая метка текущего типа
  const meta = DEVICE_TYPES[isEditing ? device.type : (selectedType || device.suggested_type)];
  const Icon: React.FC<{ size?: number; strokeWidth?: number }> = meta?.icon || HelpCircle;
  const currentTypeLabel = meta?.label || (noType ? "Не определён" : (device.suggested_type || device.type));

  // Текущая комната (для редактирования)
  const currentRoom = rooms.find((r: any) => String(r.id) === String(device.room_id || device.roomId));
  const currentRoomName = currentRoom?.name || "— Без комнаты —";

  return (
    <div className="se-modal-overlay" onClick={onClose}>
      <div className="se-modal" onClick={(e) => e.stopPropagation()}>
        <div className="se-modal-head">
          <div className="se-modal-title">{isEditing ? "Редактировать устройство" : "Новое устройство"}</div>
          <button className="se-icon-btn" onClick={onClose}><X size={16} strokeWidth={1.8} /></button>
        </div>

        <div className="se-found-row">
          <div className="se-tile-icon"><Icon size={18} strokeWidth={1.6} /></div>
          <div>
            <div className="se-found-type">{currentTypeLabel}</div>
            <div className="se-found-ieee">{device.ieee_address || device.ieee}</div>
            {isEditing && <div className="se-found-status">✅ Уже добавлено</div>}
          </div>
        </div>

        {isEditing && (
          <div className="se-current-info">
            <div className="se-field-label">Текущая комната</div>
            <div className="se-current-value">{currentRoomName}</div>
            <div className="se-field-label">Текущий тип</div>
            <div className="se-current-value">{currentTypeLabel}</div>
          </div>
        )}

        <label className="se-field-label">Имя устройства</label>
        <input className="se-input" value={name} onChange={(e) => setName(e.target.value)} />

        <label className="se-field-label">Комната</label>
        <select className="se-input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">— Без комнаты —</option>
          {rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        {/* Селектор типа — показываем всегда, но акцентируем, если тип не определён */}
        <div className="se-field-label" style={{ marginTop: 8 }}>
          Тип устройства
          {noType && (
            <span className="se-hint-tag" style={{
              display: "inline-block", marginLeft: 8, padding: "1px 8px",
              borderRadius: 4, fontSize: 11, background: "#F59E0B22", color: "#F59E0B",
            }}>
              требуется
            </span>
          )}
        </div>
        {noType && (
          <p className="text-sm text-muted-foreground" style={{
            margin: "2px 0 6px", fontSize: 12, color: "#8A8F8C",
          }}>
            Тип не определён автоматически. Выберите вручную из списка.
          </p>
        )}
        <select
          className="se-input"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
        >
          {ALL_TYPES.map((t) => {
            const m = DEVICE_TYPES[t];
            return <option key={t} value={t}>{m?.label || t}</option>;
          })}
        </select>

        <button
          className="se-primary-btn"
          disabled={!name.trim()}
          onClick={() => onConfirm({
            name: name.trim(),
            roomId,
            type: selectedType,
          })}
        >
          {isEditing ? (
            <><Edit3 size={14} strokeWidth={2} /> Сохранить изменения</>
          ) : (
            <><Check size={14} strokeWidth={2} /> Добавить в дом</>
          )}
        </button>
      </div>
    </div>
  );
}
