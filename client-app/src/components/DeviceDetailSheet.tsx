import React from "react";
import { X, Battery, Signal } from "lucide-react";
import { DEVICE_TYPES, batteryColor } from "./DeviceTile";

/* ---- DETAIL_FIELDS (from reference) ---- */
export const DETAIL_FIELDS: Record<string, { key: string; label: string; unit: string; bool?: boolean; map?: Record<string, string> }[]> = {
  contact: [
    { key: "openCountToday", label: "Открываний сегодня", unit: "" },
    { key: "lastOpenDurationMin", label: "Последний раз было открыто", unit: "мин" },
    { key: "tamper", label: "Вскрытие корпуса", unit: "", bool: true },
  ],
  presence: [
    { key: "presence", label: "Присутствие", unit: "", map: { "1": "👤 Есть", "0": "🚫 Нет" } },
    { key: "detectionDistance", label: "Дальность", unit: "м" },
    { key: "fadingTime", label: "Тайм-аут", unit: "сек" },
    { key: "motionSensitivity", label: "Движение (чувств.)", unit: "" },
    { key: "staticSensitivity", label: "Статика (чувств.)", unit: "" },
    { key: "antiInterference", label: "Анти-интерференция", unit: "" },
    { key: "lastSeenMin", label: "Не было", unit: "мин" },
  ],
  leak: [
    { key: "temperature", label: "Температура пола", unit: "°" },
    { key: "tamper", label: "Вскрытие корпуса", unit: "", bool: true },
  ],
  air: [
    { key: "temperature", label: "Температура", unit: "°" },
    { key: "humidity", label: "Влажность", unit: "%" },
    { key: "co2", label: "CO₂", unit: "ppm" },
    { key: "voc", label: "Летучие соединения (VOC)", unit: "ppb" },
    { key: "formaldehyde", label: "Формальдегид", unit: "мг/м³" },
    { key: "pm25", label: "PM2.5", unit: "мкг/м³" },
    { key: "pressure", label: "Давление", unit: "мм рт.ст." },
  ],
  light: [
    { key: "brightness", label: "Яркость", unit: "%" },
    { key: "colorTemp", label: "Цветовая температура", unit: "K" },
  ],
  plug: [
    { key: "ratedPower", label: "Мощность", unit: "Вт" },
    { key: "voltage", label: "Напряжение", unit: "В" },
    { key: "current", label: "Ток", unit: "А" },
    { key: "energy", label: "Потреблено сегодня", unit: "кВт·ч" },
    { key: "overload", label: "Перегрузка", unit: "", bool: true },
  ],
  gate: [
    { key: "lastOperatedBy", label: "Последнее управление", unit: "" },
    { key: "openDurationMin", label: "Открыты", unit: "мин" },
  ],
  climate: [
    { key: "currentTemp", label: "Текущая температура", unit: "°" },
    { key: "targetTemp", label: "Заданная температура", unit: "°" },
    { key: "mode", label: "Режим", unit: "", map: { cool: "охлаждение", heat: "обогрев", off: "выкл" } },
    { key: "fanSpeed", label: "Скорость вентилятора", unit: "" },
    { key: "filterLifePct", label: "Ресурс фильтра", unit: "%" },
  ],
};

/* ---- DeviceDetailSheet ---- */
interface DeviceDetailSheetProps {
  device: any;
  room: any;
  onClose: () => void;
  onToggle: (id: string, explicitValue?: string) => void;
  onAdjustTemp: (id: string, delta: number) => void;
  onSlider: (id: string, field: string, value: number) => void;
}

export default function DeviceDetailSheet({ device, room, onClose, onToggle, onAdjustTemp, onSlider }: DeviceDetailSheetProps) {
  const meta = DEVICE_TYPES[device.type];
  const Icon = meta.icon;
  const fields = DETAIL_FIELDS[meta.category] || [];
  const interactive = ["light", "plug", "gate_controller", "climate"].includes(device.type);

  return (
    <div className="se-modal-overlay" onClick={onClose}>
      <div className="se-modal" onClick={(e) => e.stopPropagation()}>
        <div className="se-modal-head">
          <div className="se-modal-title">{device.name}</div>
          <button className="se-icon-btn" onClick={onClose}><X size={16} strokeWidth={1.8} /></button>
        </div>

        <div className="se-detail-hero">
          <div className="se-detail-hero-icon"><Icon size={22} strokeWidth={1.5} /></div>
          <div>
            <div className="se-detail-hero-type">{meta.label}</div>
            <div className="se-detail-hero-room">{room?.name} · {device.ieee}</div>
          </div>
          {interactive && device.type !== "climate" && (
            <button
              className={"se-switch" + ((device.type === "gate_controller" ? device.state === "open" : device.state) ? " se-switch--on" : "")}
              onClick={() => onToggle(device.id, device.type === "gate_controller" ? (device.state === "open" ? "closed" : "open") : undefined)}
            >
              <span className="se-switch-knob" />
            </button>
          )}
        </div>

        {device.type === "light" && (
          <div className="se-detail-control">
            <label className="se-field-label">Яркость</label>
            <div className="se-light-row">
              <input type="range" min={0} max={100} value={device.brightness} disabled={!device.state}
                onChange={(e) => onSlider(device.id, "brightness", Number(e.target.value))} className="se-slider se-slider--sm" />
              <span className="se-mono">{device.state ? `${device.brightness}%` : "выкл"}</span>
            </div>
          </div>
        )}
        {device.type === "climate" && (
          <div className="se-detail-control">
            <label className="se-field-label">Заданная температура</label>
            <div className="se-climate-row">
              <button className="se-temp-btn" onClick={() => onAdjustTemp(device.id, -0.5)}>−</button>
              <span className="se-mono se-climate-temp">{device.targetTemp.toFixed(1)}°</span>
              <button className="se-temp-btn" onClick={() => onAdjustTemp(device.id, 0.5)}>+</button>
            </div>
          </div>
        )}

        <div className="se-detail-grid">
          {fields.map((f) => {
            let val = device[f.key];
            if (val === undefined || val === null) val = "—";
            else if (f.bool) val = val ? "да" : "нет";
            else if (f.map) val = f.map[String(val)] || val;
            else val = `${val}${f.unit ? " " + f.unit : ""}`;
            const warn = (f.key === "tamper" || f.key === "overload") && device[f.key];
            return (
              <div className="se-detail-cell" key={f.key}>
                <div className="se-label">{f.label}</div>
                <div className={"se-value" + (warn ? " se-value--alert" : "")}>{val}</div>
              </div>
            );
          })}
          {"battery" in device && (
            <div className="se-detail-cell">
              <div className="se-label">Батарея</div>
              <div className="se-value" style={{ color: batteryColor(device.battery) }}>{device.battery}%</div>
            </div>
          )}
          {"linkquality" in device && (
            <div className="se-detail-cell">
              <div className="se-label">Сигнал (LQI)</div>
              <div className="se-value">{device.linkquality}/255</div>
            </div>
          )}
        </div>

        {/* CSS для .se-detail-* */}
        <style>{`
          .se-detail-hero { display: flex; align-items: center; gap: 12px; padding: 6px 0 16px; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 14px; }
          .se-detail-hero-icon { width: 44px; height: 44px; border-radius: 12px; background: rgba(201,162,75,0.08); border: 1px solid rgba(201,162,75,0.2); color: #C9A24B; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
          .se-detail-hero-type { font-family: 'Cormorant SC', serif; font-size: 15px; color: #E9E4D8; }
          .se-detail-hero-room { font-size: 10.5px; color: #5A5F58; font-family: 'JetBrains Mono', monospace; margin-top: 2px; }
          .se-detail-hero > div:nth-child(2) { flex: 1; }
          .se-detail-control { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
          .se-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .se-detail-cell { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; padding: 10px 12px; }
          .se-detail-cell .se-label { font-size: 10.5px; color: #7A7F79; text-transform: uppercase; letter-spacing: 0.04em; }
          .se-value { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #E9E4D8; margin-top: 3px; }
          .se-value--alert { color: #D9695F; }
        `}</style>
      </div>
    </div>
  );
}
