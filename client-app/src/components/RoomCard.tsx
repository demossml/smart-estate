import React from "react";
import { ChevronDown, AlertTriangle, Plus, Home, DoorOpen, Sofa, Bed, UtensilsCrossed, TreePine } from "lucide-react";
import DeviceTile from "./DeviceTile";

/* ———————————————————————— Constants ———————————————————————— */
export const ROOM_ICONS: Record<string, React.FC<{ size?: number; strokeWidth?: number }>> = {
  hallway: DoorOpen,
  living: Sofa,
  bedroom: Bed,
  kitchen: UtensilsCrossed,
  yard: TreePine,
};
export const ROOM_ICON_LIST = Object.keys(ROOM_ICONS);

/* ———————————————————————— RoomCard ———————————————————————— */
interface RoomCardProps {
  room: any;
  devices: any[];
  expanded: boolean;
  onExpand: () => void;
  onToggleDevice: (id: string, explicitValue?: string) => void;
  onAdjustTemp: (id: string, delta: number) => void;
  onSlider: (id: string, field: string, value: number) => void;
  onAddDeviceHere: () => void;
}

export default function RoomCard({ room, devices, expanded, onExpand, onToggleDevice, onAdjustTemp, onSlider, onAddDeviceHere }: RoomCardProps) {
  const RoomIcon = ROOM_ICONS[room.icon] || Home;

  const anyOpen = devices.some((d: any) => (d.type === "window_sensor" || d.type === "door_sensor") && d.contact === "open");
  const anyLeak = devices.some((d: any) => d.type === "leak_sensor" && d.leak);
  const anyPresence = devices.some((d: any) => (d.type === "presence_sensor" || d.type === "motion_sensor") && d.presence);
  const airDev = devices.find((d: any) => d.type === "air_monitor");
  const alert = anyOpen || anyLeak;

  return (
    <div className="se-room">
      <button className="se-room-head" onClick={onExpand} aria-expanded={expanded}>
        <div className="se-room-head-left">
          <div className={"se-room-icon" + (anyPresence ? " se-room-icon--live" : "")}>
            <RoomIcon size={17} strokeWidth={1.5} />
          </div>
          <div>
            <div className="se-room-name">{room.name}</div>
            <div className="se-room-sub">
              {devices.length} устройств{airDev ? ` · ${airDev.temperature}°` : ""}
            </div>
          </div>
        </div>
        <div className="se-room-head-right">
          {alert && (
            <span className="se-alert-pill">
              <AlertTriangle size={12} strokeWidth={2} /> {anyLeak ? "протечка" : "открыто"}
            </span>
          )}
          <ChevronDown
            size={17}
            strokeWidth={1.6}
            color="#C9A24B"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 300ms" }}
          />
        </div>
      </button>

      <div className={"se-room-body" + (expanded ? " se-room-body--open" : "")}>
        <div className="se-room-body-inner">
          {devices.length === 0 ? (
            <div className="se-empty">В комнате пока нет устройств</div>
          ) : (
            <div className="se-tile-grid">
              {devices.map((d: any) => (
                <DeviceTile key={d.id} device={d} onToggle={onToggleDevice} onAdjustTemp={onAdjustTemp} onSlider={onSlider} />
              ))}
            </div>
          )}
          <button className="se-add-here" onClick={onAddDeviceHere}>
            <Plus size={13} strokeWidth={2} /> Добавить устройство в «{room.name}»
          </button>
        </div>
      </div>
    </div>
  );
}
