import React, { useState, useEffect } from "react";
import { Thermometer, Lightbulb, ShieldCheck, Zap, Workflow, DoorOpen, Sofa, Bed, UtensilsCrossed, TreePine, User, Clock } from "lucide-react";
import DeviceTile from "./DeviceTile";

/* ---- ROOM_ICONS (shared) ---- */
export const ROOM_ICONS: Record<string, React.FC<{ size?: number; strokeWidth?: number }>> = {
  hallway: DoorOpen,
  living: Sofa,
  bedroom: Bed,
  kitchen: UtensilsCrossed,
  yard: TreePine,
};
export const ROOM_ICON_LIST = Object.keys(ROOM_ICONS);

/* ---- SCENARIO_MATCHERS ---- */
export const SCENARIO_MATCHERS: Record<string, (devs: any[]) => boolean> = {
  "Открыто окно и включён кондиционер": (devs) =>
    devs.some((d) => (d.type === "window_sensor" || d.type === "door_sensor") && d.contact === "open") &&
    devs.some((d) => d.type === "climate" && d.state),
  "Движение и освещённость < 100 lux": (devs) =>
    devs.some((d) => (d.type === "presence_sensor" || d.type === "motion_sensor") && d.presence),
  "Протечка обнаружена": (devs) =>
    devs.some((d) => d.type === "leak_sensor" && d.leak),
};

/* ---- StatusStrip ---- */
interface StatusStripProps {
  devices: any[];
}

export function StatusStrip({ devices }: StatusStripProps) {
  const climateDevs = devices.filter((d) => d.type === "air_monitor" || d.type === "climate");
  const avgTemp = climateDevs.length
    ? (climateDevs.reduce((s: number, d: any) => s + (d.temperature ?? d.currentTemp ?? 0), 0) / climateDevs.length).toFixed(1)
    : "—";
  const lights = devices.filter((d: any) => d.type === "light");
  const lightsOn = lights.filter((d: any) => d.state).length;
  const securityIssues = devices.filter(
    (d: any) => ((d.type === "window_sensor" || d.type === "door_sensor") && d.contact === "open") || (d.type === "leak_sensor" && d.leak)
  ).length;
  // НАХОДКА: поле ratedPower не существует нигде — ни в типе Device, ни в
  // маппинге api/client.ts (реальное поле называется power, telemetry.power).
  // p.ratedPower был всегда undefined → s + undefined = NaN → виджет
  // "Энергия" буквально показывал "NaN кВт" на главном экране, как только
  // хотя бы одна розетка была включена.
  const kw = devices.filter((d: any) => d.type === "plug" && d.state).reduce((s: number, p: any) => s + (p.power || 0), 0) / 1000;

  const items = [
    { icon: Thermometer, label: "Климат", value: `${avgTemp}°`, tone: "normal" },
    { icon: Lightbulb, label: "Свет", value: `${lightsOn}/${lights.length}`, tone: lightsOn ? "on" : "normal" },
    { icon: ShieldCheck, label: "Безопасность", value: securityIssues ? `${securityIssues} пробл.` : "Всё в порядке", tone: securityIssues ? "alert" : "ok" },
    { icon: Zap, label: "Энергия", value: `${kw.toFixed(1)} кВт`, tone: "normal" },
  ];

  return (
    <div className="se-status-strip">
      {items.map((it, i) => (
        <div key={i} className={"se-status-chip se-status-chip--" + it.tone}>
          <it.icon size={15} strokeWidth={1.6} />
          <div>
            <div className="se-status-val">{it.value}</div>
            <div className="se-status-label">{it.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- FavoritesGrid ---- */
interface FavoritesGridProps {
  devices: any[];
  onToggle: (id: string, explicitValue?: string) => void;
  onAdjustTemp: (id: string, delta: number) => void;
  onSlider: (id: string, field: string, value: number) => void;
  onOpenDetail: (device: any) => void;
}

export function FavoritesGrid({ devices, onToggle, onAdjustTemp, onSlider, onOpenDetail }: FavoritesGridProps) {
  const favs = devices.filter((d: any) => d.favorite);
  if (!favs.length) return null;
  return (
    <div className="se-fav-section">
      <div className="se-section-label">Избранное</div>
      <div className="se-tile-grid">
        {favs.map((d: any) => (
          <DeviceTile key={d.id} device={d} onToggle={onToggle} onAdjustTemp={onAdjustTemp} onSlider={onSlider} onOpenDetail={onOpenDetail} />
        ))}
      </div>
    </div>
  );
}

/* ---- RunningNow ---- */
interface RunningNowProps {
  scenarios: any[];
  devices: any[];
}
export function RunningNow({ scenarios, devices }: RunningNowProps) {
  const running = scenarios.filter((s: any) => s.active && SCENARIO_MATCHERS[s.condition]?.(devices));
  return (
    <div className="se-running-section">
      <div className="se-section-label">
        <Workflow size={12} strokeWidth={2} /> Выполняется сейчас
      </div>
      {running.length === 0 ? (
        <div className="se-running-idle">Автоматика в режиме ожидания — нет активных срабатываний</div>
      ) : (
        <div className="se-running-list">
          {running.map((s: any) => (
            <div className="se-running-row" key={s.id}>
              <span className="se-running-dot" />
              <span className="se-running-text">{s.condition} <span className="se-scn-then">→</span> {s.action}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- PresenceMonitor ---- */
interface PresenceMonitorProps {
  devices: any[];
}
export function PresenceMonitor({ devices }: PresenceMonitorProps) {
  const presenceDevs = devices.filter((d: any) => d.type === "presence_sensor" || d.type === "motion_sensor");
  if (!presenceDevs.length) return null;

  return (
    <div className="se-running-section" style={{ marginTop: 12 }}>
      <div className="se-section-label">
        <User size={12} strokeWidth={2} /> Присутствие
      </div>
      <div className="se-running-list">
        {presenceDevs.map((d: any) => {
          const nowPresent = d.presence;
          const lastSeen = d.lastSeenMin != null ? `${d.lastSeenMin} мин` : null;
          return (
            <div className="se-running-row" key={d.id} style={{ justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="se-running-dot" style={{ background: nowPresent ? "#7FA98F" : "#5A5F58" }} />
                <span className="se-running-text">{d.name}</span>
              </div>
              <span style={{ fontSize: 12, color: nowPresent ? "#7FA98F" : "#7F8A83", fontWeight: nowPresent ? 600 : 400 }}>
                {nowPresent ? "👤 В комнате" : `🚪 Пусто · ${lastSeen || "—"}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
