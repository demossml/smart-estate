import React, { useState } from "react";
import { ArrowRight, X } from "lucide-react";

interface MoveDeviceModalProps {
  deviceName: string;
  rooms: { id: string; name: string; icon?: string }[];
  onConfirm: (roomId: string) => void;
  onClose: () => void;
}

export default function MoveDeviceModal({ deviceName, rooms, onConfirm, onClose }: MoveDeviceModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="se-modal-overlay" onClick={onClose}>
      <div className="se-modal" onClick={(e) => e.stopPropagation()}>
        {/* Head */}
        <div className="se-modal-head">
          <div className="flex items-center gap-2">
            <ArrowRight size={16} color="#C9A24B" />
            <span className="se-modal-title">Переместить устройство</span>
          </div>
          <button onClick={onClose} className="se-icon-btn" style={{ color: '#5A5F58' }}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="se-modal-sub" style={{ marginBottom: 16 }}>
          {deviceName}
        </div>

        <div style={{ fontSize: '11px', color: '#7A7F79', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Выберите комнату
        </div>

        {/* Room list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: 16 }}>
          {rooms.map((room) => (
            <button
              key={room.id}
              className="se-type-btn"
              style={{
                borderColor: selectedId === room.id ? 'rgba(201,162,75,0.5)' : 'rgba(255,255,255,0.07)',
                background: selectedId === room.id ? 'rgba(201,162,75,0.08)' : 'rgba(255,255,255,0.025)',
                color: selectedId === room.id ? '#E9E4D8' : '#B7BDB4',
              }}
              onClick={() => setSelectedId(room.id)}
            >
              <span>{room.name}</span>
              {selectedId === room.id && (
                <span style={{ marginLeft: 'auto', color: '#C9A24B', fontSize: '12px' }}>✓</span>
              )}
            </button>
          ))}
        </div>

        {rooms.length === 0 && (
          <div style={{ fontSize: '12px', color: '#5A5F58', textAlign: 'center', padding: '16px 0' }}>
            Нет доступных комнат
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="se-outline-btn"
            onClick={onClose}
            style={{ flex: 1, marginTop: 0, padding: '10px 0', fontSize: '12.5px' }}
          >
            Отмена
          </button>
          <button
            className="se-primary-btn"
            disabled={!selectedId}
            onClick={() => selectedId && onConfirm(selectedId)}
            style={{ flex: 2, marginTop: 0, padding: '10px 0', fontSize: '12.5px' }}
          >
            Переместить
          </button>
        </div>
      </div>
    </div>
  );
}
