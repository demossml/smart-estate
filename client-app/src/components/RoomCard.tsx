import React from "react";
import { ChevronDown, AlertTriangle, Plus, Trash2, Home, DoorOpen, Sofa, Bed, UtensilsCrossed, TreePine, DoorClosed, Wind, Lightbulb, Droplets, Battery } from "lucide-react";
import DeviceTile from "./DeviceTile";
import { ROOM_ICONS } from "./HomeWidgets";

/* ---- RoomCard ---- */
interface RoomCardProps {
  room: any;
  devices: any[];
  expanded: boolean;
  onExpand: () => void;
  onToggleDevice: (id: string, explicitValue?: string) => void;
  onAdjustTemp: (id: string, delta: number) => void;
  onSlider: (id: string, field: string, value: number) => void;
  onOpenDetail?: (device: any) => void;
}

export default function RoomCard({ room, devices, expanded, onExpand, onToggleDevice, onAdjustTemp, onSlider, onOpenDetail }: RoomCardProps) {
  const RoomIcon = ROOM_ICONS[room.icon] || Home;
  const windows = devices.filter((d) => d.type === "window_sensor" || d.type === "door_sensor");
  const anyOpen = windows.some((d) => d.contact === "open");
  const anyLeak = devices.some((d) => d.type === "leak_sensor" && d.leak);
  const anyPresence = devices.some((d) => (d.type === "presence_sensor" || d.type === "motion_sensor") && d.presence);
  const lightsOn = devices.filter((d) => d.type === "light" && d.state).length;
  const airDev = devices.find((d) => d.type === "air_monitor");
  const tempDev = devices.find((d) => d.type === "sensor" || d.type === "temp_sensor") || airDev;
  const lowBattery = devices.some((d) => "battery" in d && d.battery <= 20);
  const alert = anyOpen || anyLeak;

  // glance chips (status visible without expanding)
  const glances: { icon: any; text: string; tone: string }[] = [];
  if (tempDev) glances.push({ icon: Wind, text: `${tempDev.temperature}° · ${tempDev.humidity}%`, tone: "normal" });
  if (windows.length) glances.push({ icon: DoorClosed, text: anyOpen ? "окно открыто" : "закрыто", tone: anyOpen ? "alert" : "ok" });
  if (lightsOn > 0) glances.push({ icon: Lightbulb, text: `свет: ${lightsOn}`, tone: "on" });
  if (anyLeak) glances.push({ icon: Droplets, text: "протечка!", tone: "alert" });
  if (lowBattery) glances.push({ icon: Battery, text: "батарея <20%", tone: "warn" });

  return (
    <div className="se-room">
      <button className="se-room-head" onClick={onExpand} aria-expanded={expanded}>
        <div className="se-room-head-left">
          <div className={"se-room-icon" + (anyPresence ? " se-room-icon--live" : "")}><RoomIcon size={17} strokeWidth={1.5} /></div>
          <div>
            <div className="se-room-name">{room.name}</div>
            <div className="se-room-sub">{devices.length} устройств{tempDev ? ` · ${tempDev.temperature}°` : ""}</div>
          </div>
        </div>
        <div className="se-room-head-right">
          {alert && <span className="se-alert-pill"><AlertTriangle size={12} strokeWidth={2} /> {anyLeak ? "протечка" : "открыто"}</span>}
          <ChevronDown size={17} strokeWidth={1.6} color="#C9A24B" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 300ms" }} />
        </div>
      </button>

      {/* glance chips */}
      {glances.length > 0 && (
        <div className="se-glance-row">
          {glances.map((g, i) => (
            <span key={i} className={"se-glance-chip se-glance-chip--" + g.tone}>
              <g.icon size={11} strokeWidth={1.8} /> {g.text}
            </span>
          ))}
        </div>
      )}

      <div className={"se-room-body" + (expanded ? " se-room-body--open" : "")}>
        <div className="se-room-body-inner">
          {devices.length === 0 ? (
            <div className="se-empty">В комнате пока нет устройств</div>
          ) : (
            <div className="se-tile-grid">
              {devices.map((d) => (
                <DeviceTile key={d.id} device={d} onToggle={onToggleDevice} onAdjustTemp={onAdjustTemp} onSlider={onSlider} onOpenDetail={onOpenDetail} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
