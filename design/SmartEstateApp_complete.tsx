import React, { useState, useMemo } from "react";
import {
  Home,
  Workflow,
  Zap,
  Plus,
  X,
  ChevronDown,
  User,
  Activity,
  DoorClosed,
  DoorOpen,
  Droplets,
  Wind,
  Lightbulb,
  Plug as PlugIcon,
  Thermometer,
  Battery,
  Signal,
  Sun,
  Moon,
  Sofa,
  Bed,
  UtensilsCrossed,
  TreePine,
  Check,
  ArrowLeft,
  Loader2,
  Trash2,
  AlertTriangle,
} from "lucide-react";

/* ————————————————————————————————————————————————
   ТОКЕНЫ (единая система для всего приложения)
   Фон:      #0A0C0B
   Стекло:   rgba(20,26,22,0.6) + blur, кайма rgba(201,162,75,0.14)
   Золото:   #C9A24B — акценты, бренд, интерактив
   Зелень:   #4F8F68 / #5CC98A — присутствие, "живое" состояние
   Янтарь:   #7A5C2E — вторичные, приглушённые элементы
   Тревога:  #B23B34 — протечка/окно открыто/батарея
   Текст:    #E9E4D8 основной, #8B9088 приглушённый, #5A5F58 метки
   Cormorant SC — заголовки/числа, Inter — тело, JetBrains Mono — метрики
   ———————————————————————————————————————————————— */

const FONT_IMPORT =
  "https://fonts.googleapis.com/css2?family=Cormorant+SC:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";

const ROOM_ICONS: Record<string, React.FC<{ size?: number; strokeWidth?: number }>> = {
  hallway: DoorOpen,
  living: Sofa,
  bedroom: Bed,
  kitchen: UtensilsCrossed,
  yard: TreePine,
};
const ROOM_ICON_LIST = Object.keys(ROOM_ICONS);

interface DeviceMeta {
  label: string;
  category: string;
  icon: React.FC<{ size?: number; strokeWidth?: number }>;
}

const DEVICE_TYPES: Record<string, DeviceMeta> = {
  window_sensor: { label: "Датчик окна", category: "contact", icon: DoorClosed },
  door_sensor: { label: "Датчик двери", category: "contact", icon: DoorClosed },
  presence_sensor: { label: "Датчик присутствия", category: "presence", icon: User },
  motion_sensor: { label: "Датчик движения", category: "presence", icon: Activity },
  leak_sensor: { label: "Датчик протечки", category: "leak", icon: Droplets },
  air_monitor: { label: "Климат-монитор", category: "air", icon: Wind },
  light: { label: "Освещение", category: "light", icon: Lightbulb },
  plug: { label: "Розетка", category: "plug", icon: PlugIcon },
  gate_controller: { label: "Ворота", category: "gate", icon: DoorOpen },
  climate: { label: "Кондиционер", category: "climate", icon: Thermometer },
};

type RoomId = string;
type DeviceId = string;

interface Room {
  id: RoomId;
  name: string;
  icon: string;
}

interface AnyDevice {
  id: DeviceId;
  roomId: RoomId;
  type: string;
  name: string;
  battery?: number;
  linkquality?: number;
  state?: boolean | string; // gate_controller uses 'open'/'closed'
  presence?: boolean;
  lastSeenMin?: number;
  contact?: string;
  leak?: boolean;
  temperature?: number;
  humidity?: number;
  co2?: number;
  formaldehyde?: number;
  voc?: number;
  brightness?: number;
  ratedPower?: number;
  energy?: number;
  current?: number;
  targetTemp?: number;
  currentTemp?: number;
  mode?: string;
}

interface Scenario {
  id: string;
  condition: string;
  action: string;
  active: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 9);

function defaultFieldsFor(type: string): Record<string, any> {
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
        temperature: 21.5, humidity: 44, co2: 620, formaldehyde: 0.02,
        voc: 110, battery: 100, linkquality: 95,
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

const INITIAL_ROOMS: Room[] = [
  { id: "r1", name: "Прихожая", icon: "hallway" },
  { id: "r2", name: "Гостиная", icon: "living" },
  { id: "r3", name: "Спальня", icon: "bedroom" },
  { id: "r4", name: "Кухня", icon: "kitchen" },
  { id: "r5", name: "Двор", icon: "yard" },
];

const INITIAL_DEVICES: AnyDevice[] = [
  { id: uid(), roomId: "r1", type: "presence_sensor", name: "Присутствие", ...defaultFieldsFor("presence_sensor"), presence: true, lastSeenMin: 0 },
  { id: uid(), roomId: "r1", type: "light", name: "Свет у входа", ...defaultFieldsFor("light"), state: true, brightness: 55 },
  { id: uid(), roomId: "r1", type: "door_sensor", name: "Входная дверь", ...defaultFieldsFor("door_sensor") },
  { id: uid(), roomId: "r2", type: "window_sensor", name: "Окно, эркер", ...defaultFieldsFor("window_sensor"), contact: "open" },
  { id: uid(), roomId: "r2", type: "light", name: "Люстра", ...defaultFieldsFor("light"), state: true, brightness: 80 },
  { id: uid(), roomId: "r2", type: "plug", name: "Телевизор", ...defaultFieldsFor("plug"), state: true, ratedPower: 120 },
  { id: uid(), roomId: "r2", type: "air_monitor", name: "Климат-монитор", ...defaultFieldsFor("air_monitor"), co2: 720 },
  { id: uid(), roomId: "r2", type: "climate", name: "Кондиционер", ...defaultFieldsFor("climate"), state: true },
  { id: uid(), roomId: "r3", type: "window_sensor", name: "Окно", ...defaultFieldsFor("window_sensor") },
  { id: uid(), roomId: "r3", type: "motion_sensor", name: "Движение", ...defaultFieldsFor("motion_sensor") },
  { id: uid(), roomId: "r3", type: "light", name: "Ночник", ...defaultFieldsFor("light") },
  { id: uid(), roomId: "r4", type: "leak_sensor", name: "Протечка, мойка", ...defaultFieldsFor("leak_sensor") },
  { id: uid(), roomId: "r4", type: "plug", name: "Чайник", ...defaultFieldsFor("plug"), ratedPower: 2200 },
  { id: uid(), roomId: "r4", type: "window_sensor", name: "Окно", ...defaultFieldsFor("window_sensor") },
  { id: uid(), roomId: "r5", type: "gate_controller", name: "Въездные ворота", ...defaultFieldsFor("gate_controller") },
  { id: uid(), roomId: "r5", type: "air_monitor", name: "Уличный монитор", ...defaultFieldsFor("air_monitor"), co2: 410, humidity: 61 },
];

const INITIAL_SCENARIOS: Scenario[] = [
  { id: uid(), condition: "Влажность > 70%", action: "Включить вентилятор", active: true },
  { id: uid(), condition: "Температура < 18°C и время > 23:00", action: "Включить обогрев", active: true },
  { id: uid(), condition: "Открыто окно и включён кондиционер", action: "Выключить кондиционер", active: true },
  { id: uid(), condition: "Протечка обнаружена", action: "Уведомление + перекрыть воду", active: true },
  { id: uid(), condition: "Движение и освещённость < 100 lux", action: "Включить свет", active: true },
  { id: uid(), condition: "Никого нет 15 мин", action: "Выключить всё", active: false },
  { id: uid(), condition: "Рассвет", action: "Открыть шторы", active: true },
  { id: uid(), condition: "Закат", action: "Включить ночник", active: true },
];

const ENERGY_TREND = [3.1, 2.8, 2.6, 2.4, 2.9, 3.6, 4.8, 5.2, 4.1, 3.7, 3.9, 4.4, 4.9, 5.5, 6.1, 6.8, 7.2, 6.4, 5.3, 4.6, 4.0, 3.6, 3.3, 3.0];

function batteryColor(pct: number): string {
  if (pct <= 10) return "#B23B34";
  if (pct <= 20) return "#C9A24B";
  return "#7FA98F";
}

function airStatus(co2: number): { label: string; color: string } {
  if (co2 < 800) return { label: "Отлично", color: "#7FE0A8" };
  if (co2 < 1200) return { label: "Ухудшено", color: "#C9A24B" };
  return { label: "Опасно", color: "#D9695F" };
}

/* ———————————————————————— Device tile ———————————————————————— */

function DeviceTile({
  device, onToggle, onAdjustTemp, onSlider,
}: {
  device: AnyDevice;
  onToggle: (id: DeviceId, explicitValue?: string) => void;
  onAdjustTemp: (id: DeviceId, delta: number) => void;
  onSlider: (id: DeviceId, field: string, value: number) => void;
}) {
  const meta = DEVICE_TYPES[device.type];
  if (!meta) return null;
  const Icon = meta.icon;

  const interactive = ["light", "plug", "gate_controller", "climate"].includes(device.type);
  const isGate = device.type === "gate_controller";
  const gateOpen = device.state === "open";
  const isOn = typeof device.state === "boolean" ? device.state : false;

  return (
    <div className={"se-tile" + (interactive ? " se-tile--interactive" : "")}>
      <div className="se-tile-top">
        <div className="se-tile-icon">
          <Icon size={16} strokeWidth={1.6} />
        </div>
        <div className="se-tile-name">{device.name}</div>
        {interactive && device.type !== "climate" && (
          <button
            className={"se-switch" + ((isGate ? gateOpen : isOn) ? " se-switch--on" : "")}
            onClick={() => onToggle(device.id, isGate ? (gateOpen ? "closed" : "open") : undefined)}
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
            <div>
              <span className="se-mono" style={{ color: device.co2 ? airStatus(device.co2).color : undefined }}>
                {device.co2}
              </span>
              <label>CO₂</label>
            </div>
            <div><span className="se-mono">{device.voc}</span><label>VOC</label></div>
          </div>
        ) : null}

        {device.type === "light" ? (
          <div className="se-light-row">
            <input
              type="range"
              min={0}
              max={100}
              value={device.brightness ?? 0}
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
          <span className={"se-badge" + (gateOpen ? " se-badge--alert" : " se-badge--ok")}>
            {gateOpen ? "Открыты" : "Закрыты"}
          </span>
        ) : null}

        {device.type === "climate" ? (
          <div className="se-climate-row">
            <button className="se-temp-btn" onClick={() => onAdjustTemp(device.id, -0.5)}>−</button>
            <span className="se-mono se-climate-temp">{device.targetTemp?.toFixed(1)}°</span>
            <button className="se-temp-btn" onClick={() => onAdjustTemp(device.id, 0.5)}>+</button>
            <span className="se-badge" style={{ marginLeft: "auto" }}>
              {device.state ? "работает" : "выкл"}
            </span>
          </div>
        ) : null}
      </div>

      {device.battery !== undefined && (
        <div className="se-tile-foot">
          <span className="se-mini-metric">
            <Battery size={11} strokeWidth={1.6} color={batteryColor(device.battery)} />
            <span style={{ color: batteryColor(device.battery) }}>{device.battery}%</span>
          </span>
          {device.linkquality !== undefined && (
            <span className="se-mini-metric">
              <Signal size={11} strokeWidth={1.6} color="#5A5F58" />
              <span>{device.linkquality}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ———————————————————————— Room card ———————————————————————— */

function RoomCard({
  room, devices, expanded, onExpand, onToggleDevice, onAdjustTemp, onSlider, onAddDeviceHere,
}: {
  room: Room;
  devices: AnyDevice[];
  expanded: boolean;
  onExpand: () => void;
  onToggleDevice: (id: DeviceId, explicitValue?: string) => void;
  onAdjustTemp: (id: DeviceId, delta: number) => void;
  onSlider: (id: DeviceId, field: string, value: number) => void;
  onAddDeviceHere: () => void;
}) {
  const RoomIcon = ROOM_ICONS[room.icon] || Home;

  const anyOpen = devices.some((d) => (d.type === "window_sensor" || d.type === "door_sensor") && d.contact === "open");
  const anyLeak = devices.some((d) => d.type === "leak_sensor" && d.leak);
  const anyPresence = devices.some((d) => (d.type === "presence_sensor" || d.type === "motion_sensor") && d.presence);
  const airDev = devices.find((d) => d.type === "air_monitor");
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
              {devices.map((d) => (
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

/* ———————————————————————— Add device modal ———————————————————————— */

function AddDeviceModal({
  rooms, presetRoomId, onClose, onConfirm,
}: {
  rooms: Room[];
  presetRoomId: string | null;
  onClose: () => void;
  onConfirm: (data: { type: string; name: string; roomMode: string; roomId: string; newRoomName: string; newRoomIcon: string }) => void;
}) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [roomMode, setRoomMode] = useState("existing");
  const [roomId, setRoomId] = useState(presetRoomId || rooms[0]?.id || "");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomIcon, setNewRoomIcon] = useState("hallway");
  const [discovering, setDiscovering] = useState(false);

  const canNext1 = !!type;
  const canNext2 = name.trim().length > 0 && (roomMode === "existing" ? !!roomId : newRoomName.trim().length > 0);

  const handleConfirm = () => {
    setDiscovering(true);
    setTimeout(() => {
      onConfirm({ type: type!, name: name.trim(), roomMode, roomId, newRoomName: newRoomName.trim(), newRoomIcon });
    }, 1100);
  };

  return (
    <div className="se-modal-overlay" onClick={onClose}>
      <div className="se-modal" onClick={(e) => e.stopPropagation()}>
        <div className="se-modal-head">
          {step > 1 && !discovering && (
            <button className="se-icon-btn" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} strokeWidth={1.8} />
            </button>
          )}
          <div className="se-modal-title">Новое устройство</div>
          <button className="se-icon-btn" onClick={onClose}>
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        {discovering ? (
          <div className="se-discovering">
            <Loader2 size={26} strokeWidth={1.6} className="se-spin" color="#C9A24B" />
            <div className="se-discovering-text">Поиск устройства через MQTT…</div>
            <div className="se-discovering-sub">device_announce · Zigbee2MQTT</div>
          </div>
        ) : step === 1 ? (
          <>
            <div className="se-modal-sub">Выберите тип устройства</div>
            <div className="se-type-grid">
              {Object.entries(DEVICE_TYPES).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={key}
                    className={"se-type-btn" + (type === key ? " se-type-btn--active" : "")}
                    onClick={() => setType(key)}
                  >
                    <Icon size={19} strokeWidth={1.5} />
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
            <button className="se-primary-btn" disabled={!canNext1} onClick={() => setStep(2)}>
              Далее
            </button>
          </>
        ) : (
          <>
            <div className="se-modal-sub">Название и расположение</div>
            <label className="se-field-label">Имя устройства</label>
            <input
              className="se-input"
              placeholder="Например, «Окно, кабинет»"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <label className="se-field-label">Комната</label>
            <div className="se-segmented se-segmented--modal">
              <button
                className={"pc-seg-btn" + (roomMode === "existing" ? " pc-seg-btn--active" : "")}
                onClick={() => setRoomMode("existing")}
              >
                Существующая
              </button>
              <button
                className={"pc-seg-btn" + (roomMode === "new" ? " pc-seg-btn--active" : "")}
                onClick={() => setRoomMode("new")}
              >
                Новая
              </button>
            </div>

            {roomMode === "existing" ? (
              <select className="se-input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  className="se-input"
                  placeholder="Название новой комнаты"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                />
                <div className="se-icon-picker">
                  {ROOM_ICON_LIST.map((k) => {
                    const I = ROOM_ICONS[k];
                    return (
                      <button
                        key={k}
                        className={"se-icon-pick" + (newRoomIcon === k ? " se-icon-pick--active" : "")}
                        onClick={() => setNewRoomIcon(k)}
                      >
                        <I size={16} strokeWidth={1.6} />
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <button className="se-primary-btn" disabled={!canNext2} onClick={handleConfirm}>
              <Check size={14} strokeWidth={2} /> Добавить устройство
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ———————————————————————— Add room modal ———————————————————————— */

function AddRoomModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (data: { name: string; icon: string }) => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("hallway");
  return (
    <div className="se-modal-overlay" onClick={onClose}>
      <div className="se-modal" onClick={(e) => e.stopPropagation()}>
        <div className="se-modal-head">
          <div className="se-modal-title">Новая комната</div>
          <button className="se-icon-btn" onClick={onClose}>
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>
        <label className="se-field-label">Название</label>
        <input className="se-input" placeholder="Например, «Терраса»" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="se-field-label">Иконка</label>
        <div className="se-icon-picker">
          {ROOM_ICON_LIST.map((k) => {
            const I = ROOM_ICONS[k];
            return (
              <button
                key={k}
                className={"se-icon-pick" + (icon === k ? " se-icon-pick--active" : "")}
                onClick={() => setIcon(k)}
              >
                <I size={16} strokeWidth={1.6} />
              </button>
            );
          })}
        </div>
        <button
          className="se-primary-btn"
          disabled={!name.trim()}
          onClick={() => onConfirm({ name: name.trim(), icon })}
        >
          <Check size={14} strokeWidth={2} /> Создать комнату
        </button>
      </div>
    </div>
  );
}

/* ———————————————————————— Scenarios tab ———————————————————————— */

function ScenariosTab({
  scenarios, onToggle, onDelete, onAdd,
}: {
  scenarios: Scenario[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (condition: string, action: string) => void;
}) {
  const [cond, setCond] = useState("");
  const [act, setAct] = useState("");

  return (
    <div className="se-tab-pad">
      <div className="se-tab-title">Сценарии</div>
      <div className="se-tab-caption">IF-THEN правила движка автоматизации</div>

      <div className="se-scn-list">
        {scenarios.length === 0 && (
          <div className="se-empty" style={{ padding: "30px 0", textAlign: "center" }}>
            Нет сценариев. Создайте первый.
          </div>
        )}
        {scenarios.map((s) => (
          <div key={s.id} className="se-scn-row">
            <button className={"se-switch" + (s.active ? " se-switch--on" : "")} onClick={() => onToggle(s.id)}>
              <span className="se-switch-knob" />
            </button>
            <div className="se-scn-text">
              <span className="se-scn-if">ЕСЛИ</span> {s.condition} <span className="se-scn-then">→</span> {s.action}
            </div>
            <button className="se-icon-btn se-icon-btn--danger" onClick={() => onDelete(s.id)}>
              <Trash2 size={13} strokeWidth={1.8} />
            </button>
          </div>
        ))}
      </div>

      <div className="se-scn-add">
        <input className="se-input" placeholder="Условие: например, температура > 25°C" value={cond} onChange={(e) => setCond(e.target.value)} />
        <input className="se-input" placeholder="Действие: например, включить кондиционер" value={act} onChange={(e) => setAct(e.target.value)} />
        <button
          className="se-primary-btn"
          disabled={!cond.trim() || !act.trim()}
          onClick={() => {
            onAdd(cond.trim(), act.trim());
            setCond("");
            setAct("");
          }}
        >
          <Plus size={14} strokeWidth={2} /> Добавить сценарий
        </button>
      </div>
    </div>
  );
}

/* ———————————————————————— Energy tab ———————————————————————— */

function EnergyTab({ devices }: { devices: AnyDevice[] }) {
  const plugs = devices.filter((d) => d.type === "plug");
  const totalNow = plugs.reduce((sum, p) => sum + (p.state ? p.ratedPower ?? 0 : 0), 0);
  const maxTrend = Math.max(...ENERGY_TREND);

  return (
    <div className="se-tab-pad">
      <div className="se-tab-title">Энергопотребление</div>
      <div className="se-tab-caption">Розетки и общий расход дома</div>

      <div className="se-energy-hero">
        <div className="se-energy-hero-num">{(totalNow / 1000).toFixed(2)}</div>
        <div className="se-energy-hero-unit">кВт сейчас</div>
      </div>

      <div className="se-hist se-hist--energy">
        {ENERGY_TREND.map((v, i) => (
          <div className="pc-hist-col" key={i}>
            <div
              className="pc-hist-bar"
              style={{
                height: `${(v / maxTrend) * 100}%`,
                background: "linear-gradient(180deg,#C9A24B,#7A5C2E)",
              }}
            />
          </div>
        ))}
      </div>
      <div className="pc-hist-caption">кВт·ч, последние 24 ч</div>

      {plugs.length === 0 ? (
        <div className="se-empty" style={{ padding: "30px 0", textAlign: "center" }}>
          Нет розеток. Добавьте устройство типа "Розетка".
        </div>
      ) : (
        <div className="se-plug-list">
          {plugs.map((p) => (
            <div className="se-plug-row" key={p.id}>
              <PlugIcon size={15} strokeWidth={1.6} color={p.state ? "#7FE0A8" : "#5A5F58"} />
              <span className="se-plug-name">{p.name}</span>
              <span className="se-mono">{p.state ? p.ratedPower : 0} Вт</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ———————————————————————— App ———————————————————————— */

export default function SmartEstateApp() {
  const [rooms, setRooms] = useState<Room[]>(INITIAL_ROOMS);
  const [devices, setDevices] = useState<AnyDevice[]>(INITIAL_DEVICES);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ r1: true });
  const [tab, setTab] = useState("home");
  const [mode, setMode] = useState("live");
  const [scenarios, setScenarios] = useState<Scenario[]>(INITIAL_SCENARIOS);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [presetRoomId, setPresetRoomId] = useState<string | null>(null);

  const overallAir = useMemo(() => {
    const airs = devices.filter((d) => d.type === "air_monitor");
    if (!airs.length) return null;
    const worst = Math.max(...airs.map((a) => a.co2 ?? 0));
    return airStatus(worst);
  }, [devices]);

  const toggleDevice = (id: string, explicitValue?: string) => {
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        if (d.type === "gate_controller") return { ...d, state: explicitValue ?? (d.state === "open" ? "closed" : "open") };
        return { ...d, state: !d.state };
      })
    );
  };

  const adjustTemp = (id: string, delta: number) => {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, targetTemp: Math.min(28, Math.max(16, (d.targetTemp ?? 22) + delta)) }
          : d
      )
    );
  };

  const setSlider = (id: string, field: string, value: number) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [field]: value, state: value > 0 ? (d.state === false ? true : d.state) : d.state } : d))
    );
  };

  const openAddDevice = (roomId: string | null) => {
    setPresetRoomId(roomId ?? null);
    setShowAddDevice(true);
  };

  const confirmAddDevice = ({ type, name, roomMode, roomId, newRoomName, newRoomIcon }: {
    type: string; name: string; roomMode: string; roomId: string; newRoomName: string; newRoomIcon: string;
  }) => {
    let targetRoomId = roomId;
    if (roomMode === "new") {
      const id = uid();
      setRooms((prev) => [...prev, { id, name: newRoomName, icon: newRoomIcon }]);
      targetRoomId = id;
      setExpanded((e) => ({ ...e, [id]: true }));
    }
    setDevices((prev) => [...prev, { id: uid(), roomId: targetRoomId, type, name, ...defaultFieldsFor(type) }]);
    setShowAddDevice(false);
  };

  const confirmAddRoom = ({ name, icon }: { name: string; icon: string }) => {
    const id = uid();
    setRooms((prev) => [...prev, { id, name, icon }]);
    setExpanded((e) => ({ ...e, [id]: true }));
    setShowAddRoom(false);
  };

  return (
    <div className="se-stage">
      <style>{css}</style>

      <div className="se-app">
        {/* header */}
        <div className="se-header">
          <div>
            <div className="se-logo">УМНАЯ УСАДЬБА</div>
            <div className="se-logo-sub">SmartEstate · {rooms.length} комнат · {devices.length} устройств</div>
          </div>
          <button
            className="se-mode-pill"
            onClick={() => setMode((m) => (m === "live" ? "demo" : "live"))}
          >
            <span className={"se-mode-dot" + (mode === "live" ? " se-mode-dot--live" : "")} />
            {mode === "live" ? "Live" : "Demo"}
          </button>
        </div>

        {/* summary row */}
        {tab === "home" && overallAir && (
          <div className="se-summary-row">
            <div className="se-summary-chip">
              <Wind size={13} strokeWidth={1.7} color={overallAir.color} />
              <span style={{ color: overallAir.color }}>{overallAir.label}</span>
            </div>
            <div className="se-summary-chip">
              <Zap size={13} strokeWidth={1.7} color="#C9A24B" />
              <span>
                {(devices.filter((d) => d.type === "plug" && d.state).reduce((s, p) => s + (p.ratedPower ?? 0), 0) / 1000).toFixed(2)} кВт
              </span>
            </div>
          </div>
        )}

        {/* home tab */}
        {tab === "home" && (
          <div className="se-tab-pad se-tab-pad--rooms">
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                devices={devices.filter((d) => d.roomId === room.id)}
                expanded={!!expanded[room.id]}
                onExpand={() => setExpanded((e) => ({ ...e, [room.id]: !e[room.id] }))}
                onToggleDevice={toggleDevice}
                onAdjustTemp={adjustTemp}
                onSlider={setSlider}
                onAddDeviceHere={() => openAddDevice(room.id)}
              />
            ))}

            <div className="se-bottom-actions">
              <button className="se-outline-btn" onClick={() => setShowAddRoom(true)}>
                <Plus size={14} strokeWidth={2} /> Добавить комнату
              </button>
              <button className="se-outline-btn" onClick={() => openAddDevice(null)}>
                <Plus size={14} strokeWidth={2} /> Добавить устройство
              </button>
            </div>
          </div>
        )}

        {/* scenarios tab */}
        {tab === "scenarios" && (
          <ScenariosTab
            scenarios={scenarios}
            onToggle={(id) => setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s)))}
            onDelete={(id) => setScenarios((prev) => prev.filter((s) => s.id !== id))}
            onAdd={(condition, action) => setScenarios((prev) => [...prev, { id: uid(), condition, action, active: true }])}
          />
        )}

        {/* energy tab */}
        {tab === "energy" && <EnergyTab devices={devices} />}

        {/* bottom nav */}
        <div className="se-nav">
          <button
            className={"se-nav-btn" + (tab === "home" ? " se-nav-btn--active" : "")}
            onClick={() => setTab("home")}
          >
            <Home size={18} strokeWidth={1.6} />
            <span>Дом</span>
          </button>
          <button
            className={"se-nav-btn" + (tab === "scenarios" ? " se-nav-btn--active" : "")}
            onClick={() => setTab("scenarios")}
          >
            <Workflow size={18} strokeWidth={1.6} />
            <span>Сценарии</span>
          </button>
          <button
            className={"se-nav-btn" + (tab === "energy" ? " se-nav-btn--active" : "")}
            onClick={() => setTab("energy")}
          >
            <Zap size={18} strokeWidth={1.6} />
            <span>Энергия</span>
          </button>
        </div>
      </div>

      {showAddDevice && (
        <AddDeviceModal rooms={rooms} presetRoomId={presetRoomId} onClose={() => setShowAddDevice(false)} onConfirm={confirmAddDevice} />
      )}
      {showAddRoom && <AddRoomModal onClose={() => setShowAddRoom(false)} onConfirm={confirmAddRoom} />}
    </div>
  );
}

const css = `
  * { box-sizing: border-box; }
  .se-stage {
    min-height: 100vh; width: 100%;
    background: #0A0C0B;
    display: flex; justify-content: center;
    font-family: 'Inter', sans-serif;
    padding: 0;
  }
  .se-app {
    width: 420px; max-width: 100%;
    min-height: 100vh;
    background: linear-gradient(180deg, #0D110E, #0A0C0B 40%);
    position: relative;
    padding-bottom: 78px;
  }

  .se-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 22px 20px 14px;
  }
  .se-logo { font-family: 'Cormorant SC', serif; font-size: 20px; letter-spacing: 0.08em; color: #E9E4D8; font-weight: 600; }
  .se-logo-sub { font-size: 11px; color: #5A5F58; margin-top: 3px; font-family: 'JetBrains Mono', monospace; }

  .se-mode-pill {
    display: flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(201,162,75,0.18);
    border-radius: 20px;
    padding: 6px 12px;
    font-size: 11.5px; color: #C9A24B;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
  }
  .se-mode-dot { width: 6px; height: 6px; border-radius: 50%; background: #5A5F58; }
  .se-mode-dot--live { background: #5CC98A; box-shadow: 0 0 8px rgba(92,201,138,0.7); }

  .se-summary-row { display: flex; gap: 10px; padding: 0 20px 14px; }
  .se-summary-chip {
    display: flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px;
    padding: 7px 11px;
    font-size: 12px; color: #D8D3C6;
    font-family: 'JetBrains Mono', monospace;
  }

  .se-tab-pad { padding: 6px 20px 20px; }
  .se-tab-pad--rooms { display: flex; flex-direction: column; gap: 12px; }
  .se-tab-title { font-family: 'Cormorant SC', serif; font-size: 22px; color: #E9E4D8; letter-spacing: 0.03em; margin-bottom: 4px; }
  .se-tab-caption { font-size: 12px; color: #5A5F58; margin-bottom: 18px; }

  .se-room {
    border-radius: 16px;
    background: linear-gradient(165deg, rgba(24,30,25,0.65), rgba(14,18,15,0.65));
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(201,162,75,0.14);
    overflow: hidden;
  }
  .se-room-head {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; background: transparent; border: none; cursor: pointer; text-align: left; font-family: inherit;
  }
  .se-room-head-left { display: flex; align-items: center; gap: 12px; }
  .se-room-icon {
    width: 36px; height: 36px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(201,162,75,0.14);
    color: #C9A24B;
  }
  .se-room-icon--live { box-shadow: 0 0 0 1px rgba(95,201,138,0.4), 0 0 14px rgba(95,201,138,0.15); color: #7FE0A8; }
  .se-room-name { font-family: 'Cormorant SC', serif; font-size: 16.5px; color: #E9E4D8; font-weight: 600; }
  .se-room-sub { font-size: 11px; color: #5A5F58; margin-top: 2px; font-family: 'JetBrains Mono', monospace; }
  .se-room-head-right { display: flex; align-items: center; gap: 10px; }

  .se-alert-pill {
    display: flex; align-items: center; gap: 4px;
    background: rgba(178,59,52,0.14); color: #D9695F;
    border: 1px solid rgba(178,59,52,0.3);
    border-radius: 20px; padding: 3px 8px; font-size: 10.5px;
  }

  .se-room-body { max-height: 0; overflow: hidden; transition: max-height 380ms cubic-bezier(.4,0,.2,1); }
  .se-room-body--open { max-height: 900px; }
  .se-room-body-inner { padding: 0 14px 16px; border-top: 1px solid rgba(255,255,255,0.05); }
  .se-empty { padding: 16px 4px; font-size: 12px; color: #5A5F58; }

  .se-tile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
  .se-tile {
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px; padding: 10px 11px;
  }
  .se-tile--interactive { border-color: rgba(201,162,75,0.14); }
  .se-tile-top { display: flex; align-items: center; gap: 7px; }
  .se-tile-icon { color: #C9A24B; display: flex; }
  .se-tile-name { font-size: 11.5px; color: #B7BDB4; flex: 1; line-height: 1.2; }
  .se-tile-body { margin-top: 8px; min-height: 20px; }
  .se-tile-foot { display: flex; gap: 10px; margin-top: 8px; }
  .se-mini-metric { display: flex; align-items: center; gap: 3px; font-size: 10px; font-family: 'JetBrains Mono', monospace; color: #5A5F58; }

  .se-badge { font-size: 11px; color: #8B9088; font-family: 'JetBrains Mono', monospace; }
  .se-badge--ok { color: #7FE0A8; }
  .se-badge--alert { color: #D9695F; }

  .se-air-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .se-air-grid--3 { grid-template-columns: repeat(3, 1fr); }
  .se-air-grid div { display: flex; flex-direction: column; }
  .se-air-grid label { font-size: 8px; color: #4A4F4B; text-transform: uppercase; letter-spacing: 0.03em; }
  .se-mono { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: #D8D3C6; }

  .se-light-row { display: flex; align-items: center; gap: 8px; }
  .se-slider {
    -webkit-appearance: none; height: 3px; border-radius: 2px;
    background: linear-gradient(90deg,#C9A24B, rgba(255,255,255,0.08)); outline: none;
  }
  .se-slider--sm { flex: 1; }
  .se-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 12px; height: 12px;
    border-radius: 50%; background: #C9A24B; border: 2px solid #0A0C0B; cursor: pointer;
  }

  .se-climate-row { display: flex; align-items: center; gap: 8px; }
  .se-temp-btn {
    width: 22px; height: 22px; border-radius: 6px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    color: #C9A24B; font-size: 14px; cursor: pointer; line-height: 1;
  }
  .se-climate-temp { font-size: 13px; }

  .se-switch {
    width: 30px; height: 17px; border-radius: 20px;
    background: rgba(255,255,255,0.08); position: relative; border: none; cursor: pointer; flex-shrink: 0;
    transition: background 200ms ease;
  }
  .se-switch--on { background: #3E7A56; }
  .se-switch-knob {
    position: absolute; top: 2px; left: 2px;
    width: 13px; height: 13px; border-radius: 50%;
    background: #E9E4D8; transition: transform 200ms ease;
  }
  .se-switch--on .se-switch-knob { transform: translateX(13px); }

  .se-add-here {
    display: flex; align-items: center; gap: 6px;
    width: 100%; margin-top: 12px; padding: 9px 0;
    background: transparent; border: 1px dashed rgba(201,162,75,0.25);
    border-radius: 10px; color: #7A5C2E; font-size: 11.5px; cursor: pointer;
    justify-content: center; font-family: inherit;
  }
  .se-add-here:hover { color: #C9A24B; border-color: rgba(201,162,75,0.5); }

  .se-bottom-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .se-outline-btn {
    display: flex; align-items: center; justify-content: center; gap: 7px;
    padding: 12px 0; border-radius: 12px;
    background: rgba(201,162,75,0.06); border: 1px solid rgba(201,162,75,0.22);
    color: #C9A24B; font-size: 13px; cursor: pointer; font-family: inherit;
  }
  .se-outline-btn:hover { background: rgba(201,162,75,0.11); }

  .se-nav {
    position: absolute; bottom: 0; left: 0; right: 0;
    display: flex; background: rgba(10,12,11,0.9);
    backdrop-filter: blur(14px);
    border-top: 1px solid rgba(201,162,75,0.14);
    padding: 10px 8px 14px;
  }
  .se-nav-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
    background: transparent; border: none; color: #5A5F58; cursor: pointer;
    font-family: inherit; font-size: 10px;
  }
  .se-nav-btn--active { color: #C9A24B; }

  .se-scn-list { display: flex; flex-direction: column; gap: 7px; margin-bottom: 18px; }
  .se-scn-row {
    display: flex; align-items: center; gap: 10px;
    background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; padding: 10px 11px;
  }
  .se-scn-text { flex: 1; font-size: 12px; color: #B7BDB4; line-height: 1.4; }
  .se-scn-if { color: #7A5C2E; font-size: 10px; letter-spacing: 0.05em; }
  .se-scn-then { color: #C9A24B; }
  .se-icon-btn { background: transparent; border: none; color: #5A5F58; cursor: pointer; display: flex; padding: 4px; }
  .se-icon-btn--danger:hover { color: #D9695F; }

  .se-scn-add { display: flex; flex-direction: column; gap: 8px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.06); }

  .se-energy-hero { text-align: center; padding: 18px 0 8px; }
  .se-energy-hero-num { font-family: 'Cormorant SC', serif; font-size: 42px; color: #E9E4D8; line-height: 1; }
  .se-energy-hero-unit { font-size: 11px; color: #5A5F58; margin-top: 4px; letter-spacing: 0.05em; text-transform: uppercase; }
  .se-hist { display: flex; align-items: flex-end; height: 60px; gap: 2px; margin-top: 18px; }
  .se-plug-list { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
  .se-plug-row {
    display: flex; align-items: center; gap: 9px;
    background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; padding: 10px 12px;
  }
  .se-plug-name { flex: 1; font-size: 12.5px; color: #D8D3C6; }

  .pc-hist-col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; }
  .pc-hist-bar { width: 100%; border-radius: 2px 2px 0 0; min-height: 3px; }
  .pc-hist-caption { margin-top: 8px; font-size: 10px; color: #5A5F58; text-align: right; }

  .se-modal-overlay {
    position: fixed; inset: 0; background: rgba(5,6,5,0.72);
    display: flex; align-items: flex-end; justify-content: center; z-index: 50;
  }
  .se-modal {
    width: 420px; max-width: 100%; max-height: 86vh; overflow-y: auto;
    background: linear-gradient(165deg, #171C18, #0D110E);
    border: 1px solid rgba(201,162,75,0.2);
    border-radius: 20px 20px 0 0;
    padding: 18px 20px 26px;
  }
  .se-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .se-modal-title { font-family: 'Cormorant SC', serif; font-size: 17px; color: #E9E4D8; letter-spacing: 0.03em; }
  .se-modal-sub { font-size: 11.5px; color: #5A5F58; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }

  .se-type-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px; }
  .se-type-btn {
    display: flex; align-items: center; gap: 8px;
    background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 11px; padding: 11px 10px; color: #B7BDB4; font-size: 12px;
    cursor: pointer; text-align: left; font-family: inherit;
  }
  .se-type-btn--active { border-color: rgba(201,162,75,0.5); background: rgba(201,162,75,0.08); color: #E9E4D8; }

  .se-field-label { display: block; font-size: 10.5px; color: #7A7F79; text-transform: uppercase; letter-spacing: 0.04em; margin: 12px 0 6px; }
  .se-input {
    width: 100%; padding: 11px 12px; border-radius: 10px;
    background: rgba(0,0,0,0.28); border: 1px solid rgba(255,255,255,0.08);
    color: #E9E4D8; font-size: 13px; font-family: inherit; margin-bottom: 4px;
  }
  .se-input:focus { outline: none; border-color: rgba(201,162,75,0.5); }

  .se-segmented--modal { display: flex; background: rgba(0,0,0,0.25); border-radius: 9px; padding: 3px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 8px; }
  .pc-seg-btn { flex: 1; padding: 7px 0; font-size: 11.5px; font-family: inherit; color: #8B9088; background: transparent; border: none; border-radius: 7px; cursor: pointer; }
  .pc-seg-btn--active { background: linear-gradient(165deg, rgba(201,162,75,0.20), rgba(201,162,75,0.06)); color: #E9C989; box-shadow: inset 0 0 0 1px rgba(201,162,75,0.30); }

  .se-icon-picker { display: flex; gap: 8px; margin-top: 4px; }
  .se-icon-pick {
    width: 38px; height: 38px; border-radius: 10px;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
    color: #8B9088; display: flex; align-items: center; justify-content: center; cursor: pointer;
  }
  .se-icon-pick--active { border-color: rgba(201,162,75,0.5); color: #C9A24B; background: rgba(201,162,75,0.08); }

  .se-primary-btn {
    width: 100%; margin-top: 16px; padding: 13px 0;
    display: flex; align-items: center; justify-content: center; gap: 7px;
    background: linear-gradient(165deg, #C9A24B, #9C7D38);
    border: none; border-radius: 12px; color: #17130A; font-weight: 600; font-size: 13.5px;
    cursor: pointer; font-family: inherit;
  }
  .se-primary-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .se-discovering { display: flex; flex-direction: column; align-items: center; padding: 40px 0 24px; gap: 12px; }
  .se-discovering-text { color: #D8D3C6; font-size: 13.5px; }
  .se-discovering-sub { color: #5A5F58; font-size: 11px; font-family: 'JetBrains Mono', monospace; }
  .se-spin { animation: se-rotate 1s linear infinite; }
  @keyframes se-rotate { to { transform: rotate(360deg); } }
`;
