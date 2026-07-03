import React from "react";
import { Battery, Signal, DoorClosed, User, Activity, Droplets, Wind, Lightbulb, Plug as PlugIcon, Thermometer } from "lucide-react";

/* ———————————————————————— Constants ———————————————————————— */
export const DEVICE_TYPES: Record<string, { label: string; category: string; icon: React.FC<{ size?: number; strokeWidth?: number }> }> = {
  window_sensor: { label: "Датчик окна", category: "contact", icon: DoorClosed },
  door_sensor: { label: "Датчик двери", category: "contact", icon: DoorClosed },
  presence_sensor: { label: "Датчик присутствия", category: "presence", icon: User },
  motion_sensor: { label: "Датчик движения", category: "presence", icon: Activity },
  leak_sensor: { label: "Датчик протечки", category: "leak", icon: Droplets },
  air_monitor: { label: "Климат-монитор", category: "air", icon: Wind },
  light: { label: "Освещение", category: "light", icon: Lightbulb },
  plug: { label: "Розетка", category: "plug", icon: PlugIcon },
  gate_controller: { label: "Ворота", category: "gate", icon: DoorClosed },
  climate: { label: "Кондиционер", category: "climate", icon: Thermometer },
};

export function batteryColor(pct: number): string {
  if (pct <= 10) return "#B23B34";
  if (pct <= 20) return "#C9A24B";
  return "#7FA98F";
}

export function airStatus(co2: number): { label: string; color: string } {
  if (co2 < 800) return { label: "Отлично", color: "#7FE0A8" };
  if (co2 < 1200) return { label: "Ухудшено", color: "#C9A24B" };
  return { label: "Опасно", color: "#D9695F" };
}

export function defaultFieldsFor(type: string): Record<string, any> {
  switch (type) {
    case "window_sensor":
    case "door_sensor":
      return { contact: "closed", battery: 92, linkquality: 88 };
    case "presence_sensor":
    case "motion_sensor":
      return { presence: false, lastSeenMin: 12, battery: 78, linkquality: 90 };
    case "leak_sensor":
      return { leak: false, battery: 95, linkquality: 82 };
    case "air_monitor":
      return {
        temperature: 21.5,
        humidity: 44,
        co2: 620,
        formaldehyde: 0.02,
        voc: 110,
        battery: 100,
        linkquality: 95,
      };
    case "light":
      return { state: false, brightness: 70, linkquality: 97 };
    case "plug":
      return { state: false, ratedPower: 340, energy: 2.1, current: 1.4, linkquality: 91 };
    case "gate_controller":
      return { state: "closed", linkquality: 74 };
    case "climate":
      return { state: false, targetTemp: 22, currentTemp: 23.4, mode: "cool", linkquality: 89 };
    default:
      return {};
  }
}

/* ———————————————————————— DeviceTile ———————————————————————— */
interface DeviceTileProps {
  device: any;
  onToggle: (id: string, explicitValue?: string) => void;
  onAdjustTemp: (id: string, delta: number) => void;
  onSlider: (id: string, field: string, value: number) => void;
}

export default function DeviceTile({ device, onToggle, onAdjustTemp, onSlider }: DeviceTileProps) {
  const meta = DEVICE_TYPES[device.type];
  const Icon = meta.icon;
  const interactive = ["light", "plug", "gate_controller", "climate"].includes(device.type);

  return (
    <div className={"se-tile" + (interactive ? " se-tile--interactive" : "")}>
      <div className="se-tile-top">
        <div className="se-tile-icon">
          <Icon size={16} strokeWidth={1.6} />
        </div>
        <div className="se-tile-name">{device.name}</div>
        {interactive && device.type !== "climate" && (
          <button
            className={"se-switch" + ((device.type === "gate_controller" ? device.state === "open" : device.state) ? " se-switch--on" : "")}
            onClick={() =>
              onToggle(
                device.id,
                device.type === "gate_controller" ? (device.state === "open" ? "closed" : "open") : undefined
              )
            }
            aria-label="переключить"
          >
            <span className="se-switch-knob" />
          </button>
        )}
      </div>

      <div className="se-tile-body">
        {device.type === "window_sensor" || device.type === "door_sensor" ? (
          <span className={"se-badge" + (device.contact === "open" ? " se-badge--alert" : "")}>
            {device.contact === "open" ? "Открыто" : "Закрыто"}
          </span>
        ) : null}

        {device.type === "presence_sensor" || device.type === "motion_sensor" ? (
          <span className={"se-badge" + (device.presence ? " se-badge--ok" : "")}>
            {device.presence ? "Есть" : `Нет · ${device.lastSeenMin} мин`}
          </span>
        ) : null}

        {device.type === "leak_sensor" ? (
          <span className={"se-badge" + (device.leak ? " se-badge--alert" : " se-badge--ok")}>
            {device.leak ? "Протечка!" : "Сухо"}
          </span>
        ) : null}

        {device.type === "air_monitor" ? (
          <div className="se-air-grid">
            <div><span className="se-mono">{device.temperature}°</span><label>темп.</label></div>
            <div><span className="se-mono">{device.humidity}%</span><label>влажн.</label></div>
            <div><span className="se-mono" style={{ color: airStatus(device.co2).color }}>{device.co2}</span><label>CO₂</label></div>
            <div><span className="se-mono">{device.voc}</span><label>VOC</label></div>
          </div>
        ) : null}

        {device.type === "light" ? (
          <div className="se-light-row">
            <input
              type="range"
              min={0}
              max={100}
              value={device.brightness}
              disabled={!device.state}
              onChange={(e) => onSlider(device.id, "brightness", Number(e.target.value))}
              className="se-slider se-slider--sm"
            />
            <span className="se-mono">{device.state ? `${device.brightness}%` : "выкл"}</span>
          </div>
        ) : null}

        {device.type === "plug" ? (
          <div className="se-air-grid se-air-grid--3">
            <div><span className="se-mono">{device.state ? device.ratedPower : 0} Вт</span><label>мощн.</label></div>
            <div><span className="se-mono">{device.energy} кВт·ч</span><label>сегодня</label></div>
            <div><span className="se-mono">{device.state ? device.current : 0} А</span><label>ток</label></div>
          </div>
        ) : null}

        {device.type === "gate_controller" ? (
          <span className={"se-badge" + (device.state === "open" ? " se-badge--alert" : " se-badge--ok")}>
            {device.state === "open" ? "Открыты" : "Закрыты"}
          </span>
        ) : null}

        {device.type === "climate" ? (
          <div className="se-climate-row">
            <button className="se-temp-btn" onClick={() => onAdjustTemp(device.id, -0.5)}>−</button>
            <span className="se-mono se-climate-temp">{device.targetTemp.toFixed(1)}°</span>
            <button className="se-temp-btn" onClick={() => onAdjustTemp(device.id, 0.5)}>+</button>
            <span className="se-badge" style={{ marginLeft: "auto" }}>
              {device.state ? "работает" : "выкл"}
            </span>
          </div>
        ) : null}
      </div>

      {"battery" in device && (
        <div className="se-tile-foot">
          <span className="se-mini-metric">
            <Battery size={11} strokeWidth={1.6} color={batteryColor(device.battery)} />
            <span style={{ color: batteryColor(device.battery) }}>{device.battery}%</span>
          </span>
          <span className="se-mini-metric">
            <Signal size={11} strokeWidth={1.6} color="#5A5F58" />
            <span>{device.linkquality}</span>
          </span>
        </div>
      )}
    </div>
  );
}
