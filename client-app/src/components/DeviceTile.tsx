import React, { useState, useCallback, useRef, useEffect } from "react";
import { Battery, Signal, DoorClosed, User, Activity, Droplets, Wind, Lightbulb, Plug as PlugIcon, Thermometer, Trash2, Edit3, Move, X, Clock, ToggleLeft, Sun } from "lucide-react";

/* ———————————————————————— Constants ———————————————————————— */
export const DEVICE_TYPES: Record<string, { label: string; category: string; icon: React.FC<{ size?: number; strokeWidth?: number }> }> = {
  sensor: { label: "Датчик", category: "sensor", icon: Activity },
  remote: { label: "Пульт", category: "remote", icon: ToggleLeft },
  button: { label: "Кнопка", category: "remote", icon: ToggleLeft },
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
  light_sensor: { label: "Датчик освещённости", category: "sensor", icon: Sun },
  occupancy_sensor: { label: "Датчик занятости", category: "presence", icon: User },
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
      return { contact: "closed", battery: 92, linkquality: 88, last_seen: Date.now() - 60000 };
    case "presence_sensor":
    case "motion_sensor":
      return { presence: false, lastSeenMin: 12, battery: 78, linkquality: 90, last_seen: Date.now() - 720000 };
    case "leak_sensor":
      return { leak: false, battery: 95, linkquality: 82, last_seen: Date.now() - 300000 };
    case "air_monitor":
      return { temperature: 21.5, humidity: 44, co2: 620, formaldehyde: 0.02, voc: 110, battery: 100, linkquality: 95, last_seen: Date.now() - 120000 };
    case "temp_sensor":
      return { temperature: 21.5, humidity: 44, battery: 100, linkquality: 95, last_seen: Date.now() - 180000 };
    case "light":
      return { state: false, brightness: 70, linkquality: 97, last_seen: Date.now() - 5000 };
    case "plug":
      return { state: false, ratedPower: 340, energy: 2.1, current: 1.4, linkquality: 91, last_seen: Date.now() - 8000 };
    case "gate_controller":
    case "gate":
      return { state: "closed", linkquality: 74, last_seen: Date.now() - 30000 };
    case "climate":
      return { state: false, targetTemp: 22, currentTemp: 23.4, mode: "cool", linkquality: 89, last_seen: Date.now() - 15000 };
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

function isOffline(ts: number | string | undefined): boolean {
  if (!ts) return false;
  const now = Date.now();
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts;
  return (now - t) > 300000; // 5 min
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
  onEditName?: (id: string, name: string) => void;
}

export default function DeviceTile({ device, onToggle, onAdjustTemp, onSlider, onOpenDetail, onDelete, onMoveToRoom, onEditName }: DeviceTileProps) {
  const meta = DEVICE_TYPES[device.type];
  if (!meta) return null;
  const Icon = meta.icon;
  const interactive = ["light", "plug", "gate_controller", "gate", "climate"].includes(device.type);

  /* — long press → context menu — */
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editNameVal, setEditNameVal] = useState(device.name || "");

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const startLongPress = useCallback(() => {
    if (contextOpen) return;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      setContextOpen(true);
    }, 500);
  }, [contextOpen, clearLongPress]);

  const handleEditNameSubmit = useCallback(() => {
    const trimmed = editNameVal.trim();
    if (trimmed && trimmed !== device.name) {
      onEditName?.(device.ieee_address || device.id, trimmed);
    }
    setEditingName(false);
    setContextOpen(false);
  }, [editNameVal, device, onEditName]);

  useEffect(() => {
    if (editingName) {
      setEditNameVal(device.name || "");
    }
  }, [editingName, device.name]);

  /* — battery & last_seen — */
  const hasBattery = "battery" in device;
  const hasLastSeen = "last_seen" in device || "lastSeen" in device;
  const lastSeenRaw = device.last_seen || device.lastSeen;
  const offline = hasLastSeen && isOffline(lastSeenRaw);

  /* — toggle helper — */
  const toggleState = (device.type === "gate_controller" || device.type === "gate")
    ? device.state === "open"
    : device.state;

  /* — context menu actions — */
  const handleDelete = useCallback(() => {
    onDelete?.(device.ieee_address || device.id);
    setContextOpen(false);
  }, [device, onDelete]);

  const handleMove = useCallback(() => {
    onMoveToRoom?.(device.ieee_address || device.id);
    setContextOpen(false);
  }, [device, onMoveToRoom]);

  return (
    <div className="relative overflow-hidden rounded-xl" style={{ touchAction: "pan-y" }}>
      {/* ── Context Menu (long-press) ── */}
      {contextOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center pb-8"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setContextOpen(false)}
        >
          <div
            className="rounded-2xl w-[90%] max-w-sm overflow-hidden"
            style={{ background: "#1A1D1B", border: "1px solid #2A2D2B" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center py-4 border-b border-[#2A2D2B]">
              <div className="text-sm font-semibold text-[#E5E7EB]">{device.name}</div>
              <div className="text-xs text-[#7F8A83] mt-0.5">{meta.label}</div>
            </div>

            {editingName ? (
              <div className="px-4 py-3">
                <input
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "#0F1210", color: "#E5E7EB", border: "1px solid #3B82F6" }}
                  value={editNameVal}
                  onChange={(e) => setEditNameVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleEditNameSubmit(); if (e.key === "Escape") setEditingName(false); }}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    className="flex-1 py-2 rounded-lg text-xs font-medium"
                    style={{ background: "#2563EB", color: "#fff" }}
                    onClick={handleEditNameSubmit}
                  >Сохранить</button>
                  <button
                    className="py-2 px-4 rounded-lg text-xs"
                    style={{ background: "#2A2D2B", color: "#9CA3AF" }}
                    onClick={() => { setEditingName(false); setContextOpen(false); }}
                  >Отмена</button>
                </div>
              </div>
            ) : (
              <div className="py-2">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#E5E7EB] hover:bg-[#2A2D2B] transition-colors"
                  onClick={() => setEditingName(true)}
                >
                  <Edit3 size={16} strokeWidth={1.6} /> Переименовать
                </button>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#E5E7EB] hover:bg-[#2A2D2B] transition-colors"
                  onClick={() => { setContextOpen(false); onOpenDetail?.(device); }}
                >
                  <Lightbulb size={16} strokeWidth={1.6} /> Подробнее
                </button>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#D9695F] hover:bg-[#2A2D2B] transition-colors"
                  onClick={handleDelete}
                >
                  <Trash2 size={16} strokeWidth={1.6} />
                </button>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#E5E7EB] hover:bg-[#2A2D2B] transition-colors"
                  onClick={handleMove}
                >
                  <Move size={16} strokeWidth={1.6} />
                </button>
              </div>
            )}

            <div className="border-t border-[#2A2D2B] py-2">
              <button
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#7F8A83]"
                onClick={() => setContextOpen(false)}
              >
                <X size={14} /> Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main tile ── */}
      <div
        onTouchStart={startLongPress}
        onTouchEnd={clearLongPress}
        onTouchMove={clearLongPress}
        onMouseDown={startLongPress}
        onMouseUp={clearLongPress}
        onMouseLeave={clearLongPress}
        className={"se-tile" + (interactive ? " se-tile--interactive" : "")}
        onClick={() => {
          if (!contextOpen) {
            if (interactive && device.type !== 'climate') {
              if (navigator.vibrate) navigator.vibrate(10);
              onToggle?.(device.id, (device.type === 'gate_controller' || device.type === 'gate') ? (device.state === 'open' ? 'closed' : 'open') : undefined);
            } else {
              onOpenDetail?.(device);
            }
          }
        }}
        role="button"
        style={{ position: "relative", zIndex: 2 }}
      >
        {/* ── Top row: icon + name + switch ── */}
        <div className="se-tile-top">
          <div className="se-tile-icon"><Icon size={16} strokeWidth={1.6} /></div>
          <div className="se-tile-name">{device.name}</div>
          {interactive && device.type !== "climate" && (
            <button
              className={"se-switch" + (toggleState ? " se-switch--on" : "")}
              onClick={(e) => { e.stopPropagation(); onToggle?.(device.id, (device.type === "gate_controller" || device.type === "gate") ? (device.state === "open" ? "closed" : "open") : undefined); }}
              aria-label="переключить"
            >
              <span className="se-switch-knob" />
            </button>
          )}
        </div>

        {/* ── Body: device-specific content ── */}
        <div className="se-tile-body" onClick={(e) => e.stopPropagation()}>
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

          {device.type === "presence_sensor" ? (
            <div className="se-air-grid se-air-grid--3" style={{ marginTop: 4 }}>
              {(device.detectionDistance ?? device.detection_distance) != null && (
                <div><span className="se-mono">{device.detectionDistance ?? device.detection_distance} м</span><label>дальн.</label></div>
              )}
              {(device.fadingTime ?? device.fading_time) != null && (
                <div><span className="se-mono">{device.fadingTime ?? device.fading_time} с</span><label>затух.</label></div>
              )}
              {(device.motionSensitivity ?? device.motion_detection_sensitivity) != null && (
                <div><span className="se-mono">{device.motionSensitivity ?? device.motion_detection_sensitivity}</span><label>движ.</label></div>
              )}
              {(device.staticSensitivity ?? device.static_detection_sensitivity) != null && (
                <div><span className="se-mono">{device.staticSensitivity ?? device.static_detection_sensitivity}</span><label>стат.</label></div>
              )}
            </div>
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
        <div className="se-tile-foot">
          {hasBattery && (
            <span className="se-mini-metric">
              <Battery size={11} strokeWidth={1.6} color={batteryColor(device.battery)} />
              <span style={{ color: batteryColor(device.battery) }}>{device.battery}%</span>
            </span>
          )}
          <span className="se-mini-metric">
            <Signal size={11} strokeWidth={1.6} color="#5A5F58" />
            <span>{device.linkquality}</span>
          </span>
          {hasLastSeen && (
            <span className="se-mini-metric" style={{ marginLeft: "auto" }}>
              <Clock size={11} strokeWidth={1.6} color={offline ? "#EF4444" : "#5A5F58"} />
              <span style={{ color: offline ? "#EF4444" : undefined, fontWeight: offline ? 600 : undefined }}>
                {offline ? "Offline" : timeAgo(lastSeenRaw)}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
