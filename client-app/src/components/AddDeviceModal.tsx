import React, { useState, useEffect } from "react";
import { Plus, X, ArrowLeft, Check, Loader2, Radio, Wifi } from "lucide-react";
import { DEVICE_TYPES } from "./DeviceTile";
import { ROOM_ICONS, ROOM_ICON_LIST } from "./HomeWidgets";

const API = "/api";

/* ———————————————————————— AddDeviceModal ———————————————————————— */
interface PendingDevice {
  ieee_address: string;
  friendly_name: string;
  model: string;
  vendor: string;
  type: string;
}

interface AddDeviceModalProps {
  rooms: any[];
  presetRoomId: string | null;
  onClose: () => void;
  onConfirm: (data: { ieee_addr: string; type: string; name: string; roomMode: string; roomId: string; newRoomName: string; newRoomIcon: string }) => void;
}

export default function AddDeviceModal({ rooms, presetRoomId, onClose, onConfirm }: AddDeviceModalProps) {
  const [step, setStep] = useState(0); // 0 = search, 1 = type, 2 = name/room
  const [pending, setPending] = useState<PendingDevice[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<PendingDevice | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [roomMode, setRoomMode] = useState("existing");
  const [roomId, setRoomId] = useState(presetRoomId || rooms[0]?.id || "");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomIcon, setNewRoomIcon] = useState("hallway");
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    fetch(`${API}/devices/pending`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setPending(data.pending || []);
      })
      .catch(() => {})
      .finally(() => setPendingLoading(false));
  }, []);

  const hasPending = pending.length > 0;

  const canNext1 = hasPending ? !!selectedDevice : !!type;
  const canNext2 = name.trim().length > 0 && (roomMode === "existing" ? !!roomId : newRoomName.trim().length > 0);

  const handleConfirm = () => {
    setDiscovering(true);
    setTimeout(() => {
      onConfirm({
        ieee_addr: selectedDevice?.ieee_address || name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
        type: type || selectedDevice?.type || "sensor",
        name: name.trim() || selectedDevice?.friendly_name || "device",
        roomMode,
        roomId,
        newRoomName: newRoomName.trim(),
        newRoomIcon,
      });
    }, 600);
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
            <div className="se-discovering-text">Добавление устройства…</div>
          </div>
        ) : step === 0 ? (
          <>
            <div className="se-modal-sub">Устройства в Zigbee-сети</div>
            {pendingLoading ? (
              <div className="se-discovering" style={{ padding: "24px 0" }}>
                <Loader2 size={20} strokeWidth={1.6} className="se-spin" color="#C9A24B" />
                <div className="se-discovering-text" style={{ fontSize: "12px" }}>Поиск устройств…</div>
              </div>
            ) : hasPending ? (
              <div className="se-pending-list">
                {pending.map((p) => (
                  <button
                    key={p.ieee_address}
                    className={"se-pending-item" + (selectedDevice?.ieee_address === p.ieee_address ? " se-pending-item--active" : "")}
                    onClick={() => { setSelectedDevice(p); setType(p.type || "sensor"); }}
                  >
                    <div className="se-pending-left">
                      <Wifi size={15} strokeWidth={1.5} color="#5CC98A" />
                      <div>
                        <div className="se-pending-name">{p.friendly_name}</div>
                        <div className="se-pending-meta">{p.model} · {p.vendor}</div>
                      </div>
                    </div>
                    <Radio size={14} strokeWidth={1.5} color={selectedDevice?.ieee_address === p.ieee_address ? "#C9A24B" : "#5A5F58"} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="se-empty-state">
                <Wifi size={24} strokeWidth={1.5} color="#5A5F58" />
                <div className="se-empty-text">Новых устройств в сети не найдено</div>
                <div className="se-empty-sub">Включите режим сопряжения в Zigbee2MQTT и приведите устройство в режим пары</div>
              </div>
            )}
            <div className="se-bottom-actions" style={{ marginTop: "10px" }}>
              {!hasPending && (
                <button className="se-outline-btn" onClick={() => setStep(1)} style={{ marginBottom: "6px" }}>
                  Добавить вручную
                </button>
              )}
              <button className="se-primary-btn" disabled={!canNext1} onClick={() => setStep(1)}>
                Далее
              </button>
            </div>
          </>
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
                {rooms.map((r: any) => (
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
