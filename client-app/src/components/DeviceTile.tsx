import React, { useState, useCallback, useRef, useEffect } from "react";
import { useDrag } from 'react-dnd';
import { useSwipeable } from "react-swipeable";
import { Battery, Signal, DoorClosed, User, Activity, Droplets, Wind, Lightbulb, Plug as PlugIcon, Thermometer, Trash2, ArrowRight, Edit3, Move, X, Clock, Smartphone } from "lucide-react";

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
  if (diff < 60000) return `${Math.round(diff / 1000)} с назад`;
  if (diff < 3600000) return `${Math.round(diff / 60000)} мин назад`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)} ч назад`;
  return `${Math.round(diff / 86400000)} д назад`;
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

  /* — swipe state — */
  const [swipedDir, setSwipedDir] = useState<string | null>(null);
  const [swipedPct, setSwipedPct] = useState(0);

  const handlers = useSwipeable({
    onSwipedLeft: () => { onDelete?.(device.ieee_address || device.id); setSwipedDir(null); setSwipedPct(0); },
    onSwipedRight: () => { onMoveToRoom?.(device.ieee_address || device.id); setSwipedDir(null); setSwipedPct(0); },
    onSwiping: (e) => { setSwipedPct(Math.min(100, Math.abs(e.deltaX) / 2)); setSwipedDir(e.deltaX < 0 ? "left" : "right"); },
    onSwiped: () => { setSwipedDir(null); setSwipedPct(0); },
    preventScrollOnSwipe: true, trackMouse: true, delta: 50,
  });

  const translateX = swipedDir === "left" ? -swipedPct : swipedDir === "right" ? swipedPct : 0;

  /* — drag & drop — */
  const [{ isDragging }, dragRef] = useDrag({
    type: 'DEVICE',
    item: { ieee: device.ieee_address || device.id },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  /* — long press → context menu — */
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editNameVal, setEditNameVal] = useState(device.name || "");

  const handlePointerDown = useCallback(() => {
    if (contextOpen) return;
    longPressTimer.current = setTimeout(() => {
      setContextOpen(true);
    }, 500);
  }, [contextOpen]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const handlePointerMove = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  /* — edit name submit — */
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

  /* — toggle helper for big touch target — */
  const handleToggle = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    onToggle?.(device.id, (device.type === "gate_controller" || device.type === "gate")
      ? (device.state === "open" ? "closed" : "open")
      : undefined);
  }, [device, onToggle]);

  /* — battery & last_seen — */
  const hasBattery = "battery" in device;
  const hasLastSeen = "last_seen" in device || "lastSeen" in device;
  const lastSeenRaw = device.last_seen || device.lastSeen;

  return (
    <div
      ref={dragRef}
      className="relative overflow-hidden rounded-xl"
      style={{ touchAction: "pan-y", opacity: isDragging ? 0.4 : 1 }}
    >
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

            {/* Edit name */}
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
                  <Edit3 size={16} strokeWidth={1.6} /> Редактировать
                </button>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#D9695F] hover:bg-[#2A2D2B] transition-colors"
                  onClick={() => { onDelete?.(device.ieee_address || device.id); setContextOpen(false); }}
                >
                  <Trash2 size={16} strokeWidth={1.6} /> Удалить
                </button>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#E5E7EB] hover:bg-[#2A2D2B] transition-colors"
                  onClick={() => { onMoveToRoom?.(device.ieee_address || device.id); setContextOpen(false); }}
                >
                  <Move size={16} strokeWidth={1.6} /> Переместить в другую комнату
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

      {/* ── Swipe overlays (unchanged) ── */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-start pl-3"
        style={{
          width: `${Math.min(100, swipedPct + (swipedDir === "left" ? 0 : -100))}%`,
          background: "linear-gradient(90deg, transparent 0%, #7F1D1D 50%, #991B1B 100%)",
          opacity: swipedDir === "left" ? Math.min(1, swipedPct / 60) : 0,
          transition: swipedPct > 0 ? "none" : "opacity 0.3s",
          pointerEvents: "none", zIndex: 1,
        }}
      >
        <Trash2 size={22} color="#FCA5A5" strokeWidth={1.8} />
        <span style={{ color: "#FCA5A5", fontSize: 12, fontWeight: 600, marginLeft: 6 }}>Удалить</span>
      </div>
      <div
        className="absolute inset-y-0 left-0 flex items-center justify-end pr-3"
        style={{
          width: `${Math.min(100, swipedPct + (swipedDir === "right" ? 0 : -100))}%`,
          background: "linear-gradient(270deg, transparent 0%, #065F46 50%, #047857 100%)",
          opacity: swipedDir === "right" ? Math.min(1, swipedPct / 60) : 0,
          transition: swipedPct > 0 ? "none" : "opacity 0.3s",
          pointerEvents: "none", zIndex: 1,
        }}
      >
        <span style={{ color: "#A7F3D0", fontSize: 12, fontWeight: 600, marginRight: 6 }}>Переместить</span>
        <ArrowRight size={22} color="#A7F3D0" strokeWidth={1.8} />
      </div>

      {/* ── Main tile ── */}
      <div
        {...handlers}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerUp}
        className={"se-tile relative" + (interactive ? " se-tile--interactive" : "")}
        onClick={() => { if (!contextOpen) onOpenDetail?.(device); }}
        role="button"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: swipedPct > 0 ? "none" : "transform 0.3s ease-out",
          position: "relative", zIndex: 2,
          padding: "8px 10px 6px",
          cursor: "pointer",
          userSelect: "none",
          WebkitUserSelect: "none",
          touchAction: "pan-y",
          background: swipedPct > 20
            ? swipedDir === "left"
              ? "linear-gradient(165deg, rgba(127,29,29,0.2), rgba(14,18,15,0.65))"
              : "linear-gradient(165deg, rgba(6,95,70,0.2), rgba(14,18,15,0.65))"
            : undefined,
        }}
      >
        {/* ── Row 1: icon + name + large toggle ── */}
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(59,130,246,0.12)" }}>
            <Icon size={18} strokeWidth={1.6} color="#60A5FA" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[#E5E7EB] truncate">{device.name}</div>
            <div className="text-[10px] text-[#7F8A83] leading-tight">{meta.label}</div>
          </div>
          {interactive && device.type !== "climate" && (
            <button
              className={"se-switch" + (((device.type === "gate_controller" || device.type === "gate") ? device.state === "open" : device.state) ? " se-switch--on" : "")}
              onClick={handleToggle}
              onTouchEnd={(e) => { e.stopPropagation(); handleToggle(e); }}
              aria-label="переключить"
              style={{
                minWidth: 52, height: 30, borderRadius: 15, position: "relative", flexShrink: 0,
                background: ((device.type === "gate_controller" || device.type === "gate") ? device.state === "open" : device.state) ? "#2563EB" : "#2A2D2B",
                transition: "background 0.2s",
                cursor: "pointer", border: "none", outline: "none",
                padding: 0,
              }}
            >
              <span
                style={{
                  position: "absolute", top: 3,
                  left: ((device.type === "gate_controller" || device.type === "gate") ? device.state === "open" : device.state) ? 26 : 3,
                  width: 24, height: 24, borderRadius: 12,
                  background: "#F3F4F6",
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
              />
            </button>
          )}
        </div>

        {/* ── Row 2: device-specific body ── */}
        <div className="se-tile-body pl-0.5" onClick={(e) => e.stopPropagation()}>
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
              <input
                type="range" min={0} max={100}
                value={device.brightness}
                disabled={!device.state}
                onChange={(e) => onSlider?.(device.id, "brightness", Number(e.target.value))}
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

        {/* ── Row 3: battery + linkquality + last_seen ── */}
        <div className="flex items-center gap-3 mt-1.5">
          {hasBattery && (
            <span className="flex items-center gap-1">
              <Battery size={11} strokeWidth={1.6} color={batteryColor(device.battery)} />
              <span style={{ color: batteryColor(device.battery), fontSize: 10 }}>{device.battery}%</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Signal size={11} strokeWidth={1.6} color="#5A5F58" />
            <span style={{ fontSize: 10, color: "#7F8A83" }}>{device.linkquality}</span>
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
