import { useSwipeable } from 'react-swipeable';
import { useNavigate } from 'react-router-dom';
import {
  Home, DoorOpen, Sofa, Bed, UtensilsCrossed, TreePine,
  Trash2, Edit3, Plus, ChevronRight, AlertTriangle
} from 'lucide-react';

/* ── Icons ──────────────────────────────────────────── */

const ROOM_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  hallway: DoorOpen,
  living: Sofa,
  bedroom: Bed,
  kitchen: UtensilsCrossed,
  yard: TreePine,
};

function getRoomIcon(iconKey: string, size = 48) {
  const Icon = ROOM_ICONS[iconKey] || Home;
  return <Icon size={size} className="text-primary" />;
}

/* ── Props ──────────────────────────────────────────── */

interface RoomsListProps {
  rooms: any[];
  devices?: any[];
  onDeleteRoom?: (id: string) => void;
  onEditRoom?: (room: any) => void;
  onAddRoom?: () => void;
}

/* ── RoomsList ──────────────────────────────────────── */

export default function RoomsList({ rooms, devices = [], onDeleteRoom, onEditRoom, onAddRoom }: RoomsListProps) {
  const navigate = useNavigate();

  const getDeviceCount = (roomId: string) => devices.filter((d: any) => String(d.room_id) === String(roomId)).length;
  const isLivingRoom = (id: string | number) => String(id) === '1';
  const hasAlerts = (roomId: string) => {
    const roomDevices = devices.filter((d: any) => String(d.room_id) === String(roomId));
    return roomDevices.some((d: any) => {
      const ct = d.latest_telemetry?.find((t: any) => t.property === 'contact');
      return ct?.value === 1;
    });
  };

  return (
    <div className="p-4 pb-24 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-text">Комнаты</h2>
        {onAddRoom && (
          <button
            onClick={onAddRoom}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-all"
          >
            <Plus size={18} />
            Добавить
          </button>
        )}
      </div>

      {rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-surface-hover flex items-center justify-center mb-4">
            <Home size={28} className="text-text-dim" />
          </div>
          <p className="text-text-dim text-sm mb-2">Нет комнат</p>
          {onAddRoom && (
            <button onClick={onAddRoom} className="text-primary text-sm font-semibold underline underline-offset-2">
              Создать первую комнату
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => {
            const deviceCount = getDeviceCount(room.id);
            const roomHasAlerts = hasAlerts(room.id);
            const locked = isLivingRoom(room.id);

            const swipeHandlers = useSwipeable({
              onSwipedLeft: () => {
                if (!locked) onDeleteRoom?.(room.id);
              },
              preventScrollOnSwipe: true,
              delta: 50,
            });

            return (
              <div
                key={room.id}
                {...swipeHandlers}
                onClick={() => navigate(`/rooms/${room.id}`)}
                className="group relative bg-card border border-border rounded-3xl p-6 active:scale-[0.97] transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer touch-manipulation overflow-hidden"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/rooms/${room.id}`); }}
              >
                {/* Swipe hint overlay (visible on swipe) */}
                <div className="absolute inset-y-0 right-0 w-16 bg-red/10 flex items-center justify-center opacity-0 group-active:opacity-100 transition-opacity pointer-events-none">
                  <Trash2 size={20} className="text-red" />
                </div>

                {/* Top: icon + edit/delete buttons */}
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                    {getRoomIcon(room.icon, 28)}
                  </div>

                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onEditRoom && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onEditRoom(room); }}
                        className="w-9 h-9 rounded-full bg-surface-hover flex items-center justify-center active:bg-accent transition-colors"
                        aria-label="Редактировать"
                      >
                        <Edit3 size={15} className="text-text-dim" />
                      </button>
                    )}
                    {!locked && onDeleteRoom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const roomName = room.name || 'комнату';
                          if (window.confirm(`Удалить «${roomName}»?\n\nВсе устройства будут перемещены в Гостиную.`)) {
                            onDeleteRoom(room.id);
                          }
                        }}
                        className="w-9 h-9 rounded-full bg-red/10 flex items-center justify-center active:bg-red/20 transition-colors"
                        aria-label="Удалить комнату"
                      >
                        <Trash2 size={15} className="text-red" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Room name */}
                <h3 className="text-xl font-semibold text-text leading-tight mb-1">
                  {room.name}
                </h3>

                {/* Device count badge + alerts */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-surface-hover text-text-dim">
                    {deviceCount} {deviceCount === 1 ? 'устройство' : deviceCount >= 2 && deviceCount <= 4 ? 'устройства' : 'устройств'}
                  </span>

                  {roomHasAlerts && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red/10 text-red">
                      <AlertTriangle size={12} />
                      Открыто
                    </span>
                  )}

                  {locked && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue/10 text-blue">
                      Основная
                    </span>
                  )}
                </div>

                {/* Arrow indicator */}
                <ChevronRight size={18} className="absolute bottom-5 right-5 text-text-dim/40" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
