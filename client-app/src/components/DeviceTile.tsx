import React, { useState } from "react";
import { useDrag } from "react-dnd";
import { useSwipeable } from "react-swipeable";
import { Battery, Signal, DoorClosed, User, Activity, Droplets, Wind, Lightbulb, Plug as PlugIcon, Thermometer, Trash2, ArrowRight, Move, Clock } from "lucide-react";

/* ———————————————————————— Constants ———————————————————————— */
export const DEVICE_TYPES: Record<string, { label: string; category: string; icon: React.FC<{ size?: number; strokeWidth?: number }> }> = {
  sensor: { label: "Датчик", category: "sensor", icon: Activity },
  window_sensor: { label: "Датчик окна", category: "contact", icon: DoorClosed },
  door_sensor: { label: "Датчик двери", category: "contact", icon: DoorClosed },
  presence_sensor: { label: "Датчик присутствия", category: "presence", icon: User },
  motion_sensor: { label: "Датчик движения", category: "presence", icon: Activity },
  leak_sensor: { label: "Датчик протечки", category: "leak", icon: Droplets },
  air_monitor: { label: "Климат-монитор", category: "air", icon: Wind },
  temp_sensor: { label: "Термометр", category: "air", icon: Thermometer },
  light: { label: "Освещение", category: "light", icon: Lightbulb },
  plug: { label: "Розетка", category: "plug", icon: PlugIcon },
  gate_controller: { label: "Ворота", category: "gate", icon: DoorClosed },
  gate: { label: "Ворота", category: "gate", icon: DoorClosed },
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
      return { temperature: 21.5, humidity: 44, co2: 620, formaldehyde: 0.02, voc: 110, battery: 100, linkquality: 95 };
    case "temp_sensor":
      return { temperature: 21.5, humidity: 44, battery: 100, linkquality: 95 };
    case "light":
      return { state: false, brightness: 70, linkquality: 97 };
    case "plug":
      return { state: false, ratedPower: 340, energy: 2.1, current: 1.4, linkquality: 91 };
    case "gate_controller":
    case "gate":
      return { state: "closed", linkquality: 74 };
    case "climate":
      return { state: false, targetTemp: 22, currentTemp: 23.4, mode: "cool", linkquality: 89 };
    default:
      return {};
  }
}

function timeAgo(ts: number | string | undefined): string {
  if (!ts) return "—";
  const now = Date.now();
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const diff = now - t;
  if (diff < 60000) return `${Math.round(diff / 1000)}с`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}м`;
  return `${Math.round(diff / 3600000)}ч`;
}

/* ———————————————————————— DeviceTile ———————————————————————— */
interface DeviceTileProps {
  device: any;
  onToggle?: (id: string, explicitValue?: string) => void;
  onAdjustTemp?: (id: string, delta: number) => void;
  onSlider?: (id: string, field: string, value: number) => void;
  onOpenDetail?: (device: any) => void;
  onDelete?: (id: string) => void;
  onMoveToRoom?: (id: string) => void;
}

export default function DeviceTile({ device, onToggle, onAdjustTemp, onSlider, onOpenDetail, onDelete, onMoveToRoom }: DeviceTileProps) {
  const meta = DEVICE_TYPES[device.type];
  if (!meta) return null;
  const Icon = meta.icon;
  const interactive = ["light", "plug", "gate_controller", "gate", "climate"].includes(device.type);

  /* — swipe state — */
  const [swipedDir, setSwipedDir] = useState<string | null>(null);
  const [swipedPct, setSwipedPct] = useState(0);

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      if (window.confirm("Удалить устройство?")) {
        onDelete?.(device.ieee_address || device.id);
      }
      setSwipedDir(null);
      setSwipedPct(0);
    },
    onSwipedRight: () => {
      onMoveToRoom?.(device.ieee_address || device.id);
      setSwipedDir(null);
      setSwipedPct(0);
    },
    onSwiping: (e) => {
      const pct = Math.min(100, Math.abs(e.deltaX) / 2);
      setSwipedPct(pct);
      setSwipedDir(e.deltaX < 0 ? "left" : "right");
    },
    onSwiped: () => {
      setSwipedDir(null);
      setSwipedPct(0);
    },
    preventScrollOnSwipe: true,
    trackMouse: true,
    delta: 80,
  });

  const translateX = swipedDir === "left" ? -swipedPct : swipedDir === "right" ? swipedPct : 0;

  /* — drag & drop — */
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'DEVICE',
    item: { ieee: device.ieee_address || device.id },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [device.ieee_address, device.id]);

  const hasBattery = "battery" in device;
  const hasLastSeen = "last_seen" in device || "lastSeen" in device;
  const lastSeenRaw = device.last_seen || device.lastSeen;

  return (
    <div
      ref={drag}
      className={`relative overflow-hidden rounded-xl ${isDragging ? 'opacity-50' : ''}`}
      style={{ touchAction: "pan-y" }}
    >
      {/* ── Swipe overlays ── */}
      {/* Red — delete layer (visible when swiping left) */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-start pl-3"
        style={{
          width: `${Math.min(100, swipedPct + (swipedDir === "left" ? 0 : -100))}%`,
          background: "linear-gradient(90deg, transparent 0%, #7F1D1D 50%, #991B1B 100%)",
          opacity: swipedDir === "left" ? Math.min(1, swipedPct / 60) : 0,
          transition: swipedPct > 0 ? "none" : "opacity 0.3s",
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        <Trash2 size={22} color="#FCA5A5" strokeWidth={1.8} />
        <span style={{ color: "#FCA5A5", fontSize: 12, fontWeight: 600, marginLeft: 6 }}>Удалить</span>
      </div>

      {/* Green — move layer (visible when swiping right) */}
      <div
        className="absolute inset-y-0 left-0 flex items-center justify-end pr-3"
        style={{
          width: `${Math.min(100, swipedPct + (swipedDir === "right" ? 0 : -100))}%`,
          background: "linear-gradient(270deg, transparent 0%, #065F46 50%, #047857 100%)",
          opacity: swipedDir === "right" ? Math.min(1, swipedPct / 60) : 0,
          transition: swipedPct > 0 ? "none" : "opacity 0.3s",
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        <span style={{ color: "#A7F3D0", fontSize: 12, fontWeight: 600, marginRight: 6 }}>Переместить</span>
        <ArrowRight size={22} color="#A7F3D0" strokeWidth={1.8} />
      </div>

      {/* ── Main tile ── */}
      <div
        {...handlers}
        className="relative bg-card border rounded-3xl p-5 active:scale-95 transition-all overflow-hidden touch-manipulation"
        onClick={() => onOpenDetail?.(device)}
        role="button"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: swipedPct > 0 ? "none" : "transform 0.3s ease-out",
          position: "relative",
          zIndex: 2,
          background: swipedPct > 20
            ? swipedDir === "left"
              ? "linear-gradient(165deg, rgba(127,29,29,0.2), rgba(14,18,15,0.65))"
              : "linear-gradient(165deg, rgba(6,95,70,0.2), rgba(14,18,15,0.65))"
            : undefined,
        }}
      >
        {/* ── Row 1: icon + name + toggle ── */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(59,130,246,0.12)" }}>
            <Icon size={20} strokeWidth={1.6} color="#60A5FA" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-[#E5E7EB] truncate">{device.name}</div>
            <div className="text-xs text-[#7F8A83]">{meta.label}</div>
          </div>
          {interactive && device.type !== "climate" && (
            <button
              className="se-switch"
              style={{
                minWidth: 56, height: 32, borderRadius: 16, position: "relative", flexShrink: 0,
                background: ((device.type === "gate_controller" || device.type === "gate") ? device.state === "open" : device.state) ? "#2563EB" : "#2A2D2B",
                transition: "background 0.2s",
                cursor: "pointer", border: "none", outline: "none", padding: 0,
              }}
              onClick={(e) => { e.stopPropagation(); onToggle?.(device.id, (device.type === "gate_controller" || device.type === "gate") ? (device.state === "open" ? "closed" : "open") : undefined); }}
              aria-label="переключить"
            >
              <span style={{
                position: "absolute", top: 3,
                left: ((device.type === "gate_controller" || device.type === "gate") ? device.state === "open" : device.state) ? 29 : 3,
                width: 26, height: 26, borderRadius: 13,
                background: "#F3F4F6",
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }} />
            </button>
          )}
        </div>

        {/* ── Row 2: device-specific body ── */}
        <div className="mb-2" onClick={(e) => e.stopPropagation()}>
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

          {device.type === "temp_sensor" || device.type === "sensor" ? (
            <div className="se-air-grid se-air-grid--3">
              <div><span className="se-mono">{device.temperature ?? "—"}°</span><label>темп.</label></div>
              <div><span className="se-mono">{device.humidity ?? "—"}%</span><label>влажн.</label></div>
            </div>
          ) : null}

          {device.type === "light" ? (
            <div className="se-light-row">
              <input type="range" min={0} max={100} value={device.brightness} disabled={!device.state}
                onChange={(e) => onSlider?.(device.id, "brightness", Number(e.target.value))}
                className="se-slider se-slider--sm" />
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

          {device.type === "gate_controller" || device.type === "gate" ? (
            <span className={"se-badge" + (device.state === "open" ? " se-badge--alert" : " se-badge--ok")}>
              {device.state === "open" ? "Открыты" : "Закрыты"}
            </span>
          ) : null}

          {device.type === "climate" ? (
            <div className="se-climate-row">
              <button className="se-temp-btn" onClick={() => onAdjustTemp?.(device.id, -0.5)}>−</button>
              <span className="se-mono se-climate-temp">{device.targetTemp.toFixed(1)}°</span>
              <button className="se-temp-btn" onClick={() => onAdjustTemp?.(device.id, 0.5)}>+</button>
              <span className="se-badge" style={{ marginLeft: "auto" }}>
                {device.state ? "работает" : "выкл"}
              </span>
            </div>
          ) : null}
        </div>

        {/* ── Footer: battery + linkquality + last_seen ── */}
        <div className="flex items-center gap-3 pt-2 border-t border-[#2A2D2B]/50">
          {hasBattery && (
            <span className="flex items-center gap-1">
              <Battery size={12} strokeWidth={1.6} color={batteryColor(device.battery)} />
              <span style={{ color: batteryColor(device.battery), fontSize: 11, fontWeight: 500 }}>{device.battery}%</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Signal size={12} strokeWidth={1.6} color="#5A5F58" />
            <span style={{ fontSize: 11, color: "#7F8A83" }}>{device.linkquality}</span>
          </span>
          {hasLastSeen && (
            <span className="flex items-center gap-1 ml-auto">
              <Clock size={10} strokeWidth={1.6} color="#5A5F58" />
              <span style={{ fontSize: 10, color: "#7F8A83" }}>{timeAgo(lastSeenRaw)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
