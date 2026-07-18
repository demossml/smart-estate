import React, { useRef } from "react";
import { Thermometer, Lightbulb, ShieldCheck, Zap, DoorOpen, Sofa, Bed, UtensilsCrossed, TreePine, Wind, ArrowRight, Activity, Home } from "lucide-react";
import { airStatus } from "./DeviceTile";

/* ---- ROOM_ICONS (shared) ---- */
export const ROOM_ICONS: Record<string, React.FC<{ size?: number; strokeWidth?: number }>> = {
  hallway: DoorOpen,
  living: Sofa,
  bedroom: Bed,
  kitchen: UtensilsCrossed,
  yard: TreePine,
};
export const ROOM_ICON_LIST = Object.keys(ROOM_ICONS);

/* ---- Helpers ---- */
function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "Доброе утро";
  if (h >= 12 && h < 18) return "Добрый день";
  if (h >= 18 && h < 23) return "Добрый вечер";
  return "Спокойной ночи";
}

function formatDate(): string {
  const d = new Date();
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

/* ---- PINNED ROOMS (localStorage) ---- */
function getPinnedRooms(): string[] {
  try {
    const raw = localStorage.getItem('se_pinned_rooms');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function setPinnedRooms(ids: string[]) {
  localStorage.setItem('se_pinned_rooms', JSON.stringify(ids));
}

/* ---- FAKE_USER_NAME ---- */
const USER_NAME = localStorage.getItem('se_user_name') || '';

/* ---- StatusStrip ---- */
interface StatusStripProps {
  devices: any[];
  onChipClick?: (filter: string) => void;
}

export function StatusStrip({ devices, onChipClick }: StatusStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const climateDevs = devices.filter((d) => d.type === "air_monitor" || d.type === "climate");
  const avgTemp = climateDevs.length
    ? (climateDevs.reduce((s: number, d: any) => s + (d.temperature ?? d.currentTemp ?? 0), 0) / climateDevs.length).toFixed(1)
    : "—";
  const lights = devices.filter((d: any) => d.type === "light");
  const lightsOn = lights.filter((d: any) => d.state).length;
  const securityIssues = devices.filter(
    (d: any) => ((d.type === "window_sensor" || d.type === "door_sensor") && d.contact === "open") || (d.type === "leak_sensor" && d.leak)
  ).length;
  const kw = devices.filter((d: any) => d.type === "plug" && d.state).reduce((s: number, p: any) => s + (p.power || 0), 0) / 1000;

  const items = [
    { key: "security", icon: ShieldCheck, label: "Безопасность", value: securityIssues ? `${securityIssues} пробл.` : "Всё в порядке", tone: securityIssues ? ("alert" as const) : ("ok" as const) },
    { key: "climate", icon: Thermometer, label: "Климат", value: `${avgTemp}°`, tone: "normal" as const },
    { key: "light", icon: Lightbulb, label: "Свет", value: `${lightsOn}/${lights.length}`, tone: lightsOn ? ("on" as const) : ("normal" as const) },
    { key: "energy", icon: Zap, label: "Энергия", value: `${kw.toFixed(1)} кВт`, tone: "normal" as const },
  ];

  return (
    <div ref={scrollRef} className="se-status-strip-scroll">
      <div className="se-status-strip">
        {items.map((it) => (
          <div
            key={it.key}
            className={"se-status-chip se-status-chip--" + it.tone}
            onClick={() => onChipClick?.(it.key)}
            role="button"
            tabIndex={0}
          >
            <it.icon size={15} strokeWidth={1.6} />
            <div>
              <div className="se-status-val">{it.value}</div>
              <div className="se-status-label">{it.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Greeting Section ---- */
interface GreetingProps {
  securityTone: "ok" | "alert" | "warning";
  devices: any[];
}

export function GreetingSection({ securityTone, devices }: GreetingProps) {
  const securityIssues = devices.filter(
    (d: any) => ((d.type === "window_sensor" || d.type === "door_sensor") && d.contact === "open") || (d.type === "leak_sensor" && d.leak)
  ).length;

  const toneIcon = securityTone === "ok" ? "🟢" : securityTone === "warning" ? "🟡" : "🔴";
  const toneText = securityIssues === 0 ? "Всё в порядке" : `${securityIssues} треб. внимания`;

  return (
    <div className="se-greeting">
      <div className="se-greeting-row">
        <div className="se-greeting-text">
          {getTimeGreeting()}{USER_NAME ? `, ${USER_NAME}` : ''}
        </div>
        <div className="se-security-status" title={toneText}>
          {toneIcon}
        </div>
      </div>
      <div className="se-greeting-date">
        {formatDate()}
      </div>
    </div>
  );
}

/* ---- Favorites 2×2 Grid ---- */
interface FavoritesGridProps {
  devices: any[];
  onToggle: (id: string, explicitValue?: string) => void;
  onAdjustTemp: (id: string, delta: number) => void;
  onSlider: (id: string, field: string, value: number) => void;
  onOpenDetail: (device: any) => void;
  onViewAll: () => void;
}

export function FavoritesGrid({ devices, onToggle, onAdjustTemp, onSlider, onOpenDetail, onViewAll }: FavoritesGridProps) {
  const favs = devices.filter((d: any) => d.favorite).slice(0, 4);

  return (
    <div className="se-fav-section">
      <div className="se-section-label">Избранное</div>
      <div className="se-fav-grid-2x2">
        {favs.map((d: any) => (
          <FavButton key={d.id} device={d} onToggle={onToggle} onOpenDetail={onOpenDetail} />
        ))}
      </div>
      <button className="se-fav-all-btn" onClick={onViewAll}>
        <span>Все быстрые действия</span>
        <ArrowRight size={14} strokeWidth={1.6} />
      </button>
    </div>
  );
}

function FavButton({ device, onToggle, onOpenDetail }: { device: any; onToggle: (id: string, v?: string) => void; onOpenDetail: (d: any) => void }) {
  const handleClick = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    if (device.type === "light" || device.type === "plug" || device.type === "climate") {
      onToggle(device.id);
    } else {
      onOpenDetail(device);
    }
  };

  return (
    <div className="se-fav-btn" onClick={handleClick} role="button" tabIndex={0}>
      <div className="se-fav-btn-icon">{getDeviceIcon(device.type)}</div>
      <div className="se-fav-btn-name">{device.name?.substring(0, 12) || "Устройство"}</div>
      {device.state !== undefined && (
        <div className={"se-fav-btn-state" + (device.state ? " se-fav-btn-state--on" : "")}>
          {device.state ? "Вкл" : "Выкл"}
        </div>
      )}
    </div>
  );
}

function getDeviceIcon(type: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    light: <Lightbulb size={18} strokeWidth={1.6} />,
    plug: <Zap size={18} strokeWidth={1.6} />,
    climate: <Thermometer size={18} strokeWidth={1.6} />,
    lock: <ShieldCheck size={18} strokeWidth={1.6} />,
    gate_controller: <DoorOpen size={18} strokeWidth={1.6} />,
  };
  return icons[type] || <Activity size={18} strokeWidth={1.6} />;
}

/* ---- Quick Rooms (horizontal scroll, max 4) ---- */
interface QuickRoomsProps {
  rooms: any[];
  devices: any[];
  onRoomClick: (roomId: string) => void;
  onPinRoom: (roomId: string) => void;
  pinnedRooms: string[];
}

export function QuickRooms({ rooms, devices, onRoomClick, onPinRoom, pinnedRooms }: QuickRoomsProps) {
  if (!rooms.length) {
    return (
      <div className="se-empty-state">
        <div className="se-empty-text">🏠 Нет комнат</div>
        <div className="se-empty-sub">Добавьте первую комнату с устройствами</div>
      </div>
    );
  }

  // Sort: pinned first, then alphabetical
  const sorted = [...rooms].sort((a, b) => {
    const aPinned = pinnedRooms.includes(a.id) ? 0 : 1;
    const bPinned = pinnedRooms.includes(b.id) ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;
    return (a.name || '').localeCompare(b.name || '');
  }).slice(0, 4);

  return (
    <div className="se-quick-rooms">
      <div className="se-section-label">Комнаты</div>
      <div className="se-room-scroll">
        <div className="se-room-scroll-inner">
          {sorted.map((room) => {
            const roomDevices = devices.filter((d: any) => String(d.room_id) === room.id).map(d => ({ ...d, temperature: d.temperature, humidity: d.humidity }));
            const hasTemp = roomDevices.some((d: any) => d.temperature != null);
            const avgT = hasTemp ? (roomDevices.reduce((s: number, d: any) => s + (d.temperature || 0), 0) / roomDevices.length).toFixed(1) : null;
            const isPinned = pinnedRooms.includes(room.id);
            const RoomIcon = ROOM_ICONS[room.icon] || Sofa;
            return (
              <div
                key={room.id}
                className="se-quick-room-card"
                onClick={() => onRoomClick(room.id)}
                onContextMenu={(e) => { e.preventDefault(); onPinRoom(room.id); }}
                role="button"
                tabIndex={0}
              >
                {isPinned && <span className="se-pinned-badge">📌</span>}
                <div className="se-quick-room-icon"><RoomIcon size={18} strokeWidth={1.5} /></div>
                <div className="se-quick-room-name">{room.name}</div>
                {avgT != null && <div className="se-quick-room-temp">{avgT}°</div>}
                <div className="se-quick-room-count">{roomDevices.length} уст.</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---- Quick Scenarios 2×2 ---- */
interface QuickScenariosProps {
  scenarios: any[];
  devices: any[];
  onRunScenario: (id: string) => void;
}

export function QuickScenarios({ scenarios, devices, onRunScenario }: QuickScenariosProps) {
  if (!scenarios.length) {
    return (
      <div className="se-quick-scenarios">
        <div className="se-section-label">📋 Быстрые сценарии</div>
        <div className="se-running-idle">Создайте первый сценарий автоматизации</div>
      </div>
    );
  }

  const quick = scenarios.slice(0, 4);

  const scenarioIcons: Record<string, string> = {
    "Ушёл": "🏃",
    "ушёл": "🏃",
    "Ушел": "🏃",
    "Вернулся": "🏠",
    "вернулся": "🏠",
    "Гости": "🍕",
    "гости": "🍕",
    "Кино": "🎬",
    "кино": "🎬",
    "Ночь": "🌙",
    "ночь": "🌙",
    "Утро": "☀️",
    "утро": "☀️",
  };

  return (
    <div className="se-quick-scenarios">
      <div className="se-section-label">📋 Быстрые сценарии</div>
      <div className="se-scenario-grid-2x2">
        {quick.map((s: any) => {
          const icon = Object.entries(scenarioIcons).find(([key]) => s.condition?.toLowerCase().includes(key.toLowerCase()))?.[1] || "⚡";
          return (
            <button
              key={s.id}
              className="se-scenario-btn"
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(15);
                onRunScenario(s.id);
              }}
            >
              <span className="se-scenario-icon">{icon}</span>
              <span className="se-scenario-text">{s.condition || "Сценарий"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Quick Widgets 2×2 ---- */
interface QuickWidgetsProps {
  devices: any[];
  onNavigate: (tab: string) => void;
}

export function QuickWidgets({ devices, onNavigate }: QuickWidgetsProps) {
  const kw = devices.filter((d: any) => d.type === "plug" && d.state).reduce((s: number, p: any) => s + (p.power || 0), 0) / 1000;
  const securityIssues = devices.filter(
    (d: any) => ((d.type === "window_sensor" || d.type === "door_sensor") && d.contact === "open") || (d.type === "leak_sensor" && d.leak)
  ).length;
  const airDevs = devices.filter((d) => d.type === "air_monitor");
  const avgCo2 = airDevs.length ? Math.round(airDevs.reduce((s: number, d: any) => s + (d.co2 || 0), 0) / airDevs.length) : null;
  const avgVoc = airDevs.length ? Math.round(airDevs.reduce((s: number, d: any) => s + (d.voc || 0), 0) / airDevs.length) : null;

  const widgets = [
    {
      key: "energy",
      icon: Zap,
      label: "Энергия",
      value: `${kw.toFixed(1)} кВт·ч`,
      sub: "за сегодня",
      tone: "normal" as const,
      onClick: () => onNavigate("energy"),
    },
    {
      key: "security",
      icon: ShieldCheck,
      label: "Безопасность",
      value: securityIssues ? `${securityIssues} открыто` : "Всё в порядке",
      sub: securityIssues ? "окон/дверей" : "",
      tone: securityIssues ? ("alert" as const) : ("ok" as const),
      onClick: () => {},
    },
    {
      key: "air",
      icon: Wind,
      label: "Воздух",
      value: avgCo2 != null ? `CO₂: ${avgCo2} ppm` : "—",
      sub: avgVoc != null ? `VOC: ${avgVoc}` : "",
      tone: avgCo2 != null && avgCo2 > 800 ? ("warn" as const) : avgCo2 != null && avgCo2 > 1200 ? ("alert" as const) : ("ok" as const),
      onClick: () => {},
    },
    {
      key: "events",
      icon: Clock,
      label: "События",
      value: "Последние",
      sub: "нет записей",
      tone: "normal" as const,
      onClick: () => onNavigate("manage"),
    },
  ];

  return (
    <div className="se-quick-widgets">
      <div className="se-section-label">Обзор</div>
      <div className="se-widget-grid-2x2">
        {widgets.map((w) => (
          <div
            key={w.key}
            className={"se-widget se-widget--" + w.tone}
            onClick={w.onClick}
            role="button"
            tabIndex={0}
          >
            <div className="se-widget-top">
              <w.icon size={16} strokeWidth={1.6} />
              <span className="se-widget-label">{w.label}</span>
            </div>
            <div className="se-widget-value">{w.value}</div>
            {w.sub && <div className="se-widget-sub">{w.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Empty State (Home) ---- */
export function EmptyHomeState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="se-home-empty">
      <div className="se-home-empty-icon"><Home size={48} strokeWidth={1.2} /></div>
      <div className="se-home-empty-text">Начнём? Добавьте первое устройство,<br />чтобы управлять домом с телефона</div>
      <button className="se-primary-btn" onClick={onAdd}>+ Добавить устройство</button>
    </div>
  );
}
