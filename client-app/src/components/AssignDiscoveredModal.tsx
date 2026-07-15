import React, { useState } from "react";
import { Check, X, Edit3, HelpCircle, Sparkles } from "lucide-react";
import { DEVICE_TYPES } from "./DeviceTile";

/* ———— Все возможные типы устройств ———— */
const ALL_TYPES = Object.keys(DEVICE_TYPES);

/* ———— Форматирование имени ———— */
function suggestName(device: any): string {
  const raw = device.suggestedName || device.name || device.friendly_name || "";
  // Если тип не определён — всегда "Датчик + short ieee"
  if (!device.suggested_type && !device.type) {
    const ieee = device.ieee_address || device.ieee || "";
    return ieee ? `Датчик ${ieee.replace('0x', '').slice(-8).toUpperCase()}` : "Новое устройство";
  }
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
  // API base URL для вызова эндпоинтов AI
  apiBase?: string;
  onDevicesRefresh?: () => void;
}

export default function AssignDiscoveredModal({ device, rooms, onClose, onConfirm, apiBase = '', onDevicesRefresh }: AssignDiscoveredModalProps) {
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

  // AI-предложение
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestedType, setAiSuggestedType] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [applyAllLoading, setApplyAllLoading] = useState(false);

  // Показать AI-баннер: только если нет типа (noType) и ещё не запрашивали
  const showAiPrompt = noType && !aiSuggestedType && !aiLoading && !aiError;

  // Отображаемая метка текущего типа
  const meta = DEVICE_TYPES[isEditing ? device.type : (selectedType || device.suggested_type)];
  const Icon: React.FC<{ size?: number; strokeWidth?: number }> = meta?.icon || HelpCircle;
  const currentTypeLabel = meta?.label || (noType ? "Не определён" : (device.suggested_type || device.type));

  // Текущая комната (для редактирования)
  const currentRoom = rooms.find((r: any) => String(r.id) === String(device.room_id || device.roomId));
  const currentRoomName = currentRoom?.name || "— Без комнаты —";

  // Запросить AI-предложение
  const handleAiSuggest = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const ieee = device.ieee_address || device.ieee;
      const res = await fetch(`${apiBase}/api/discovery/${ieee}/ai-suggest`, { method: 'POST' });
      const data = await res.json();
      if (data.ok && data.ai_suggested_type) {
        setAiSuggestedType(data.ai_suggested_type);
        setSelectedType(data.ai_suggested_type);
      } else {
        setAiError(data.error || 'AI не смог определить тип');
      }
    } catch (e: any) {
      setAiError('Ошибка сети при вызове AI');
    } finally {
      setAiLoading(false);
    }
  };

  // Принять AI-предложение для одного устройства
  const handleAcceptAi = async () => {
    if (!aiSuggestedType) return;
    const ieee = device.ieee_address || device.ieee;
    await fetch(`${apiBase}/api/discovery/${ieee}/confirm-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_type: aiSuggestedType }),
    });
    // Обновляем список
    onDevicesRefresh?.();
  };

  // Применить AI-тип для всех устройств этой модели
  const handleApplyAll = async () => {
    if (!aiSuggestedType || !device.model) return;
    setApplyAllLoading(true);
    try {
      await fetch(`${apiBase}/api/discovery/apply-ai-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: device.model,
          vendor: device.vendor || '',
          ai_type: aiSuggestedType,
        }),
      });
      onDevicesRefresh?.();
    } finally {
      setApplyAllLoading(false);
    }
  };

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

        {/* AI-предложение */}
        {showAiPrompt && (
          <div className="se-ai-section" style={{
            marginTop: 12, padding: 12, borderRadius: 8,
            background: 'linear-gradient(135deg, #7C3AED15, #A855F708)',
            border: '1px solid #7C3AED30',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Sparkles size={16} strokeWidth={1.8} color="#7C3AED" />
              <span style={{ fontWeight: 600, fontSize: 13, color: '#7C3AED' }}>
                ИИ-классификация
              </span>
            </div>
            <p style={{ margin: '2px 0 8px', fontSize: 12, color: '#6B6F6C', lineHeight: 1.4 }}>
              Тип не определён автоматически. ИИ может проанализировать характеристики устройства и предложить тип.
            </p>
            <button
              className="se-secondary-btn"
              onClick={handleAiSuggest}
              disabled={aiLoading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 6,
                background: '#7C3AED', color: '#fff', border: 'none',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                opacity: aiLoading ? 0.6 : 1,
              }}
            >
              <Sparkles size={14} strokeWidth={1.8} />
              {aiLoading ? 'AI думает...' : 'Спросить ИИ'}
            </button>
            {aiError && (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#EF4444' }}>
                ❌ {aiError}
              </p>
            )}
          </div>
        )}

        {/* Баннер с AI-предложением */}
        {aiSuggestedType && (
          <div className="se-ai-suggestion" style={{
            marginTop: 12, padding: 12, borderRadius: 8,
            background: 'linear-gradient(135deg, #7C3AED15, #A855F708)',
            border: '1px solid #7C3AED30',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Sparkles size={16} strokeWidth={1.8} color="#7C3AED" />
              <span style={{ fontWeight: 600, fontSize: 13, color: '#7C3AED' }}>
                🤖 ИИ предлагает: <span style={{ textTransform: 'capitalize' }}>{aiSuggestedType}</span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                className="se-ai-accept"
                onClick={handleAcceptAi}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 6,
                  background: '#059669', color: '#fff', border: 'none',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                }}
              >
                <Check size={14} strokeWidth={2} />
                Принять предложение ИИ
              </button>
              {device.model && (
                <button
                  className="se-ai-apply-all"
                  onClick={handleApplyAll}
                  disabled={applyAllLoading}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 6,
                    background: '#7C3AED', color: '#fff', border: 'none',
                    fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    opacity: applyAllLoading ? 0.6 : 1,
                  }}
                >
                  <Sparkles size={14} strokeWidth={1.8} />
                  {applyAllLoading ? 'Применяю...' : 'Применить для всех устройств этой модели'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Селектор типа — показываем всегда */}
        <div className="se-field-label" style={{ marginTop: noType && !aiSuggestedType ? 16 : 12 }}>
          Тип устройства
          {noType && !aiSuggestedType && (
            <span className="se-hint-tag" style={{
              display: "inline-block", marginLeft: 8, padding: "1px 8px",
              borderRadius: 4, fontSize: 11, background: "#F59E0B22", color: "#F59E0B",
            }}>
              Требуется настройка
            </span>
          )}
        </div>

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
            <><Check size={14} strokeWidth={2} /> Сохранить и добавить в комнату</>
          )}
        </button>
      </div>
    </div>
  );
}
