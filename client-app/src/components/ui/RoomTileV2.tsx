import { useState, useCallback } from 'react';
import { ChevronDown, AlertTriangle, Home, Sofa, Bed, UtensilsCrossed, TreePine, DoorOpen, User, Clock } from 'lucide-react';
import { DeviceTile, type DeviceData, DEVICE_TYPE_META, ROOM_ICONS } from './DeviceTile';
import DeviceDetailSheet from '../DeviceDetailSheet';
import { api } from '../../api/client';

/* ── Types ─────────────────────────────────────────────── */

interface RoomV2Data {
  id: number;
  name: string;
  icon: string;
  device_count: number | null;
  temperature: number | null;
  devices: DeviceData[];
  open_windows?: { ieee_addr: string; friendly_name: string }[];
  has_open_windows?: boolean;
  air_quality?: any;
}

/* ── Helpers ─────────────────────────────────────────────── */

/**
 * Возвращает статус присутствия для комнаты:
 * - status: 'present' | 'recent' | 'absent'
 * - label: строка для отображения под названием комнаты
 * - color: цвет рамки/фона иконки комнаты
 */
function roomPresenceSummary(devices: DeviceData[]): { status: 'present' | 'recent' | 'absent'; label: string | null; color: string } {
  const presenceDevs = devices.filter(d => d.type === 'presence_sensor' || d.type === 'motion_sensor');
  if (!presenceDevs.length) return { status: 'absent', label: null, color: '#5A5F58' };

  let anyPresent = false;
  let minAgo = Infinity;

  for (const d of presenceDevs) {
    const pTel = d.latest_telemetry?.find(t => t.property === 'presence');
    if (pTel?.value === 1) { anyPresent = true; }
    if (d.last_presence_minutes !== null && d.last_presence_minutes < minAgo) {
      minAgo = d.last_presence_minutes;
    }
  }

  if (anyPresent) return { status: 'present', label: 'Есть', color: '#3B9F6E' };
  if (minAgo <= 15) return { status: 'recent', label: `Вышел · ${minAgo} мин`, color: '#B8860B' };
  return { status: 'absent', label: null, color: '#5A5F58' };
}

interface RoomTileV2Props {
  room: RoomV2Data;
  telemetryTick?: number;
  onAddDevice?: (roomId: number) => void;
}

/* ── Helpers ─────────────────────────────────────────────── */

function isOpenableDevice(type: string): boolean {
  return type === 'window_sensor' || type === 'door_sensor' || type === 'gate_controller';
}

/* ── Main Component ────────────────────────────────────── */

export function RoomTileV2({ room, telemetryTick, onAddDevice }: RoomTileV2Props) {
  const [open, setOpen] = useState(false);
  const [detailDevice, setDetailDevice] = useState<DeviceData | null>(null);
  const RoomIcon = ROOM_ICONS[room.icon] || Home;

  const devices = room.devices || [];

  const anyOpen = devices.some(
    (d) => (d.type === 'window_sensor' || d.type === 'door_sensor') &&
      d.latest_telemetry?.some((t) => t.property === 'contact' && t.value === 1)
  );
  const anyLeak = devices.some(
    (d) => d.type === 'leak_sensor' &&
      d.latest_telemetry?.some((t) => t.property === 'water_leak' && t.value === 1)
  );
  const airDev = devices.find((d) => d.type === 'air_monitor');
  const alert = anyOpen || anyLeak;

  // Статус присутствия для этой комнаты
  const roomPresence = roomPresenceSummary(devices);

  const handleToggle = useCallback(async (deviceId: string) => {
    const dev = devices.find(d => d.ieee_addr === deviceId);
    if (!dev) return;
    const stateTel = dev.latest_telemetry?.find(t => t.property === 'state');
    const isOn = stateTel ? stateTel.value > 0 : false;
    try {
      await (isOn ? api.deviceOff(deviceId) : api.deviceOn(deviceId));
    } catch { /* optimistic */ }
  }, [devices]);

  const handleAdjustTemp = useCallback(async (deviceId: string, delta: number) => {
    // Пока просто заглушка — будет реализовано в API
  }, []);

  const handleSlider = useCallback(async (deviceId: string, field: string, value: number) => {
    // Пока заглушка
  }, []);

  return (
    <div className="se-room">
      <button className="se-room-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="se-room-head-left">
          <div
            className="se-room-icon"
            style={{
              borderColor: roomPresence.color,
              backgroundColor: `${roomPresence.color}12`,
            }}
          >
            {roomPresence.status === 'present' ? <User size={17} strokeWidth={1.5} color={roomPresence.color} /> : <RoomIcon size={17} strokeWidth={1.5} />}
          </div>
          <div>
            <div className="se-room-name">{room.name}</div>
            <div className="se-room-sub">
              <span>{devices.length} устройств</span>
              {roomPresence.label && <span style={{ color: roomPresence.color }}> · {roomPresence.label}</span>}
              {airDev && room.temperature != null && <span className="text-text-dim"> · {room.temperature}°</span>}
            </div>
          </div>
        </div>
        <div className="se-room-head-right">
          {alert && (
            <span className="se-alert-pill">
              <AlertTriangle size={12} strokeWidth={2} /> {anyLeak ? 'протечка' : 'открыто'}
            </span>
          )}
          <ChevronDown
            size={17}
            strokeWidth={1.6}
            color="#C9A24B"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 300ms' }}
          />
        </div>
      </button>

      <div className={'se-room-body' + (open ? ' se-room-body--open' : '')}>
        <div className="se-room-body-inner">
          {devices.length === 0 ? (
            <div className="se-empty">В комнате пока нет устройств</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {devices.map((d) => (
                <DeviceTile
                  key={d.ieee_addr + (telemetryTick ?? 0)}
                  device={d}
                  onToggle={handleToggle}
                  onAdjustTemp={handleAdjustTemp}
                  onSlider={handleSlider}
                  onDetails={(dev) => setDetailDevice(dev)}
                />
              ))}
            </div>
          )}
          <button className="min-h-12 text-base active:bg-accent w-full text-center rounded-lg bg-surface-hover text-text-dim font-medium transition-colors" onClick={() => onAddDevice?.(room.id)}>
            + Добавить устройство в «{room.name}»
          </button>
        </div>
      </div>
    </div>

    {detailDevice && (
      <DeviceDetailSheet
        device={detailDevice}
        room={room}
        onClose={() => setDetailDevice(null)}
        onToggle={handleToggle}
        onAdjustTemp={handleAdjustTemp}
        onSlider={handleSlider}
      />
    )}
  );
}
