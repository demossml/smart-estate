import React, { useState } from "react";
import { Trash2, Plus, X, Check, ChevronRight, Move } from "lucide-react";

/* ————————————————————————————————————————————————————————————————
   ИДЕЯ: у каждого типа устройства — своя PARAM_SCHEMA (данные, не код).
   Один универсальный <ParamField> умеет рендерить любой контрол по описанию
   схемы (toggle / slider / select / number). Поэтому добавлять новый тип
   устройства = дописать схему, а не писать новую форму.

   У устройств без настраиваемых параметров schema.params = [] —
   компонент сам показывает пустое состояние, ничего дополнительно
   обрабатывать не нужно.
   ———————————————————————————————————————————————————————————————— */

const PARAM_SCHEMAS: Record<string, { label: string; params: any[] }> = {
  window_sensor: { label: "Датчик окна", params: [] },
  door_sensor: { label: "Датчик двери", params: [] },

  presence_sensor: {
    label: "Датчик присутствия",
    params: [
      { key: "sensitivity", label: "Чувствительность", control: "select", options: ["Низкая", "Средняя", "Высокая"], default: "Средняя" },
      { key: "timeoutSec", label: "Тайм-аут присутствия", control: "slider", min: 10, max: 600, step: 10, unit: "сек", default: 180 },
      { key: "zoneFilter", label: "Учитывать только ближнюю зону", control: "toggle", default: false },
    ],
  },

  motion_sensor: {
    label: "Датчик движения",
    params: [
      { key: "sensitivity", label: "Чувствительность", control: "select", options: ["Низкая", "Средняя", "Высокая"], default: "Средняя" },
      { key: "timeoutSec", label: "Тайм-аут", control: "slider", min: 5, max: 300, step: 5, unit: "сек", default: 30 },
    ],
  },

  leak_sensor: {
    label: "Датчик протечки",
    params: [{ key: "alarmSound", label: "Звуковой сигнал при протечке", control: "toggle", default: true }],
  },

  light: {
    label: "Освещение",
    params: [
      { key: "colorTemp", label: "Цветовая температура", control: "slider", min: 2700, max: 6500, step: 100, unit: "K", default: 3500 },
      { key: "powerOnBehavior", label: "При включении питания", control: "select", options: ["Восстановить состояние", "Всегда включён", "Всегда выключен"], default: "Восстановить состояние" },
    ],
  },

  plug: {
    label: "Розетка",
    params: [
      { key: "childLock", label: "Блокировка от детей", control: "toggle", default: false },
      { key: "overloadLimit", label: "Порог перегрузки", control: "number", min: 500, max: 4000, step: 100, unit: "Вт", default: 2500 },
    ],
  },

  gate_controller: {
    label: "Ворота",
    params: [
      { key: "autoClose", label: "Автозакрытие", control: "toggle", default: true },
      { key: "autoCloseDelayMin", label: "Задержка автозакрытия", control: "slider", min: 1, max: 30, step: 1, unit: "мин", default: 5 },
    ],
  },
  // НАХОДКА (Модуль 8, Находка 22 продолжается): та же проблема, что в
  // DeviceTile.tsx — реальный бэкенд-классификатор/demo.ts/API используют
  // 'gate', не 'gate_controller'. Без алиаса реальные ворота получали бы
  // пустую схему параметров (без "Автозакрытие"), хотя явно для этого
  // спроектированы.
  gate: {
    label: "Ворота",
    params: [
      { key: "autoClose", label: "Автозакрытие", control: "toggle", default: true },
      { key: "autoCloseDelayMin", label: "Задержка автозакрытия", control: "slider", min: 1, max: 30, step: 1, unit: "мин", default: 5 },
    ],
  },

  climate: {
    label: "Кондиционер",
    params: [
      { key: "mode", label: "Режим", control: "select", options: ["cool", "heat", "fan", "off"], default: "cool" },
      { key: "fanSpeed", label: "Скорость вентилятора", control: "select", options: ["авто", "низкая", "средняя", "высокая"], default: "авто" },
      { key: "swing", label: "Поворотные жалюзи", control: "toggle", default: false },
    ],
  },

  air_monitor: {
    label: "Климат-монитор",
    params: [{ key: "reportIntervalSec", label: "Интервал отправки данных", control: "select", options: ["10", "30", "60", "300"], default: "60" }],
  },
};

export { PARAM_SCHEMAS };
function defaultParamsFor(type: string): Record<string, any> {
  const schema = PARAM_SCHEMAS[type];
  if (!schema) return {};
  return Object.fromEntries(schema.params.map((p: any) => [p.key, p.default]));
}

/* ———————————————————————— универсальный рендерер одного параметра ———————————————————————— */

interface ParamFieldProps {
  param: any;
  value: any;
  onChange: (value: any) => void;
}

function ParamField({ param, value, onChange }: ParamFieldProps) {
  switch (param.control) {
    case "toggle":
      return (
        <div className="dc-row">
          <span className="dc-row-label">{param.label}</span>
          <button className={"se-switch" + (value ? " se-switch--on" : "")} onClick={() => onChange(!value)}>
            <span className="se-switch-knob" />
          </button>
        </div>
      );
    case "slider":
      return (
        <div className="dc-field">
          <div className="dc-field-row">
            <span className="dc-row-label">{param.label}</span>
            <span className="se-mono">{value}{param.unit ? " " + param.unit : ""}</span>
          </div>
          <input
            type="range"
            min={param.min}
            max={param.max}
            step={param.step || 1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="se-slider"
          />
        </div>
      );
    case "select":
      return (
        <div className="dc-field">
          <span className="dc-row-label">{param.label}</span>
          <select className="se-input" value={value} onChange={(e) => onChange(e.target.value)}>
            {param.options.map((o: string) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      );
    case "number":
      return (
        <div className="dc-field">
          <span className="dc-row-label">{param.label}</span>
          <input
            type="number"
            className="se-input"
            min={param.min}
            max={param.max}
            step={param.step || 1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </div>
      );
    default:
      return null;
  }
}

/* ———————————————————————— панель настройки устройства (модалка снизу) ———————————————————————— */

import { DEVICE_TYPE_ICONS, DEVICE_TYPE_LABELS } from "../lib/icon-map";

interface DeviceConfigSheetProps {
  device: any;
  onClose: () => void;
  onSave: (id: string, params: Record<string, any>) => void;
  onRemoveFromRoom: (id: string) => void;
  onDelete: (id: string) => void;
  onRenameDevice?: (id: string, name: string, type?: string) => void;
}

function DeviceConfigSheet({ device, onClose, onSave, onRemoveFromRoom, onDelete, onRenameDevice }: DeviceConfigSheetProps) {
  const schema = PARAM_SCHEMAS[device.type] || { label: device.type, params: [] };
  const [draft, setDraft] = useState<Record<string, any>>({ ...defaultParamsFor(device.type), ...device.params });
  const [editName, setEditName] = useState(device.name || "");
  const [editType, setEditType] = useState(device.type || "");
  const [savingName, setSavingName] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  const setParam = (key: string, value: any) => setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSaveName = async () => {
    if (!editName.trim() || !onRenameDevice) return;
    setSavingName(true);
    try {
      await onRenameDevice(device.id, editName.trim(), editType !== device.type ? editType : undefined);
    } finally {
      setSavingName(false);
    }
  };

  const handleDelete = async () => {
    if (busyDelete) return;
    const confirmMsg = `Удалить устройство «${device.name}»?\n\nДанные телеметрии будут потеряны.`;
    if (!window.confirm(confirmMsg)) return;
    setBusyDelete(true);
    try {
      await onDelete(device.id);
      onClose();
    } finally {
      setBusyDelete(false);
    }
  };

  // Типы датчиков для выбора иконки
  const deviceTypes = Object.entries(DEVICE_TYPE_ICONS).map(([type, Icon]) => ({
    type,
    Icon,
    label: DEVICE_TYPE_LABELS[type] || type,
  }));

  return (
    <div className="se-modal-overlay" onClick={onClose}>
      <div className="se-modal" onClick={(e) => e.stopPropagation()}>
        <div className="se-modal-head">
          <div className="se-modal-title">{device.name}</div>
          <button className="se-icon-btn" onClick={onClose}><X size={16} strokeWidth={1.8} /></button>
        </div>
        <div className="se-modal-sub">{schema.label}</div>

        {/* ── Редактирование названия и типа ── */}
        <div className="dc-rename-section">
          <label className="se-field-label">Название</label>
          <input
            className="se-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Название устройства"
          />

          <label className="se-field-label" style={{ marginTop: 12 }}>Тип / Иконка</label>
          <div className="dc-type-grid">
            {deviceTypes.map(({ type, Icon, label }) => (
              <button
                key={type}
                className={"dc-type-btn" + (editType === type ? " dc-type-btn--active" : "")}
                onClick={() => setEditType(type)}
                title={label}
              >
                <Icon size={16} strokeWidth={1.6} />
              </button>
            ))}
          </div>

          {(editName !== device.name || editType !== device.type) && (
            <button
              className="se-primary-btn"
              onClick={handleSaveName}
              disabled={!editName.trim() || savingName}
              style={{ marginTop: 10 }}
            >
              {savingName ? (
                <><span className="se-spin">⟳</span> Сохранение…</>
              ) : (
                <><Check size={14} strokeWidth={2} /> Сохранить название</>
              )}
            </button>
          )}
        </div>

        {/* ── Параметры устройства ── */}
        {schema.params.length === 0 ? (
          <div className="se-briefing" style={{ marginTop: 12 }}>
            У этого устройства нет настраиваемых параметров — только показания
            и диагностика (батарея, сигнал).
          </div>
        ) : (
          <div className="dc-params" style={{ marginTop: 16 }}>
            {schema.params.map((p: any) => (
              <ParamField key={p.key} param={p} value={draft[p.key]} onChange={(v) => setParam(p.key, v)} />
            ))}
          </div>
        )}

        {/* ── Кнопки действий ── */}
        <div className="dc-actions" style={{ marginTop: 18 }}>
          {schema.params.length > 0 && (
            <button className="se-primary-btn" onClick={() => onSave(device.id, draft)}>
              <Check size={14} strokeWidth={2} /> Сохранить настройки
            </button>
          )}
          <div className="dc-actions-row">
            <button className="se-outline-btn" onClick={() => onRemoveFromRoom(device.id)} style={{ flex: 1 }}>
              <Move size={13} strokeWidth={1.8} /> Переместить
            </button>
            <button
              className="se-outline-btn se-outline-btn--danger"
              onClick={handleDelete}
              disabled={busyDelete}
              style={{ flex: 1 }}
            >
              <Trash2 size={13} strokeWidth={1.8} /> {busyDelete ? "Удаление…" : "Удалить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ———————————————————————— карточка устройства в списке комнаты ———————————————————————— */

interface DeviceRowProps {
  device: any;
  onOpenConfig: (device: any) => void;
}

function DeviceRow({ device, onOpenConfig }: DeviceRowProps) {
  const schema = PARAM_SCHEMAS[device.type];
  return (
    <button className="dc-device-row" onClick={() => onOpenConfig(device)}>
      <span className="dc-device-name">{device.name}</span>
      <span className="dc-device-meta">{schema?.params.length ? `${schema.params.length} параметр.` : "без настроек"}</span>
      <ChevronRight size={15} strokeWidth={1.6} color="#5A5F58" />
    </button>
  );
}

/* ———————————————————————— список устройств комнаты + добавление ———————————————————————— */

interface RoomDevicesManagerProps {
  room: any;
  devices: any[];
  onAddDevice: (device: { type: string; name: string; params: Record<string, any>; roomId: string | number }) => void;
  onSaveParams: (id: string, params: Record<string, any>) => void;
  onRemoveFromRoom: (id: string) => void;
  onDeleteDevice: (id: string) => void;
  onRenameDevice?: (id: string, name: string, type?: string) => void;
}

export default function RoomDevicesManager({ room, devices, onAddDevice, onSaveParams, onRemoveFromRoom, onDeleteDevice, onRenameDevice }: RoomDevicesManagerProps) {
  const [configDevice, setConfigDevice] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="dc-room">
      <style>{css}</style>

      <div className="dc-room-head">
        <span className="dc-room-head-name">{room.name}</span>
        <button className="se-icon-btn" onClick={() => setShowAdd(true)}><Plus size={16} strokeWidth={1.8} /></button>
      </div>

      {devices.length === 0 ? (
        <div className="se-empty" style={{ padding: "12px 4px" }}>В комнате пока нет устройств</div>
      ) : (
        devices.map((d: any) => (
          <DeviceRow key={d.id} device={d} onOpenConfig={setConfigDevice} />
        ))
      )}

      {configDevice && (
        <DeviceConfigSheet
          device={configDevice}
          onClose={() => setConfigDevice(null)}
          onSave={(id, params) => { onSaveParams(id, params); setConfigDevice(null); }}
          onRemoveFromRoom={(id) => { onRemoveFromRoom(id); setConfigDevice(null); }}
          onDelete={(id) => { onDeleteDevice(id); setConfigDevice(null); }}
          onRenameDevice={onRenameDevice}
        />
      )}

      {showAdd && (
        <AddDeviceSheet
          onClose={() => setShowAdd(false)}
          onAdd={(type, name) => {
            // НАХОДКА: раньше room.id вообще не передавался дальше — App.tsx
            // не мог узнать, в какую комнату добавляется устройство, даже
            // если бы сам вызов API был реализован.
            onAddDevice({ type, name, params: defaultParamsFor(type), roomId: room.id });
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

/* ———————————————————————— модалка добавления нового устройства ———————————————————————— */

interface AddDeviceSheetProps {
  onClose: () => void;
  onAdd: (type: string, name: string) => void;
}
function AddDeviceSheet({ onClose, onAdd }: AddDeviceSheetProps) {
  const [type, setType] = useState<string | null>(null);
  const [name, setName] = useState("");
  return (
    <div className="se-modal-overlay" onClick={onClose}>
      <div className="se-modal" onClick={(e) => e.stopPropagation()}>
        <div className="se-modal-head">
          <div className="se-modal-title">Добавить устройство</div>
          <button className="se-icon-btn" onClick={onClose}><X size={16} strokeWidth={1.8} /></button>
        </div>
        <div className="se-type-grid">
          {Object.entries(PARAM_SCHEMAS).map(([key, s]) => (
            <button
              key={key}
              className={"se-type-btn" + (type === key ? " se-type-btn--active" : "")}
              onClick={() => setType(key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          className="se-input"
          placeholder="Имя устройства"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginTop: 4 }}
        />
        <button
          className="se-primary-btn"
          disabled={!type || !name.trim()}
          onClick={() => onAdd(type!, name.trim())}
        >
          <Plus size={14} strokeWidth={2} /> Добавить
        </button>
      </div>
    </div>
  );
}

const css = `
  /* — Room wrapper — */
  .dc-room { margin-bottom: 14px; }

  .dc-room-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .dc-room-head-name { font-family: 'Inter', sans-serif; font-size: 13px; color: #B7BDB4; font-weight: 500; }

  /* — Device row — */
  .dc-device-row { width: 100%; display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 12px; margin-bottom: 6px; cursor: pointer; color: inherit; font-family: inherit; transition: border-color 150ms ease, background 150ms ease; }
  .dc-device-row:hover { border-color: rgba(201,162,75,0.3); background: rgba(255,255,255,0.04); }
  .dc-device-name { flex: 1; font-size: 12.5px; color: #D8D3C6; text-align: left; }
  .dc-device-meta { font-size: 10.5px; color: #5A5F58; font-family: 'JetBrains Mono', monospace; }

  /* — Params list — */
  .dc-params { display: flex; flex-direction: column; gap: 16px; margin-bottom: 4px; }
  .dc-field-row, .dc-row { display: flex; align-items: center; justify-content: space-between; }
  .dc-row-label { font-size: 12.5px; color: #D8D3C6; font-family: 'Inter', sans-serif; }

  /* — Larger slider for params — */
  .dc-params .se-slider { height: 3px; }
  .dc-params .se-slider::-webkit-slider-thumb { width: 24px; height: 24px; border-width: 3px; }

  /* — Actions — */
  .dc-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 18px; }
  .dc-actions .se-outline-btn { margin-top: 0; }
  .dc-actions-row { display: flex; gap: 8px; }

  /* — Rename section — */
  .dc-rename-section { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 12px; margin-bottom: 14px; }

  /* — Type grid for icon selection — */
  .dc-type-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 6px; }
  .dc-type-btn { display: flex; align-items: center; justify-content: center; min-height: 40px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.02); color: #7A7F79; cursor: pointer; transition: all 0.15s; }
  .dc-type-btn:hover { border-color: rgba(201,162,75,0.4); color: #C9A24B; }
  .dc-type-btn--active { border-color: #C9A24B; background: rgba(201,162,75,0.12); color: #C9A24B; }
`;