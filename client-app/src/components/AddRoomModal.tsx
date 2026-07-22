import React, { useState, useRef } from "react";
import { X, Check } from "lucide-react";
import { ROOM_ICONS, ROOM_ICON_LIST } from "./HomeWidgets";

/* ———————————————————————— AddRoomModal ———————————————————————— */
interface AddRoomModalProps {
  onClose: () => void;
  onConfirm: (data: { name: string; icon: string }) => void;
  room?: any; // если передан — режим редактирования
}

export default function AddRoomModal({ onClose, onConfirm, room }: AddRoomModalProps) {
  const [name, setName] = useState(room?.name || "");
  const [icon, setIcon] = useState(room?.icon || "hallway");
  const isEdit = !!room;
  const nameRef = useRef<HTMLInputElement>(null);

  const scrollSaveIntoView = () => {
    setTimeout(() => {
      const btn = document.querySelector(".ar-save-btn");
      btn?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full sm:max-w-lg bg-surface border border-surface-hover rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 animate-slide-up max-h-[90dvh] overflow-y-auto"
        style={{ maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 sticky top-0 z-10 pb-1" style={{ backdropFilter: "blur(8px)" }}>
          <h2 className="text-lg font-bold text-text">{isEdit ? "Редактировать комнату" : "Новая комната"}</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-lg flex items-center justify-center tap-active"
          >
            <X size={22} className="text-text-dim" />
          </button>
        </div>

        <label className="block text-xs text-text-dim mb-1.5 font-semibold">Название</label>
        <input
          ref={nameRef}
          className="w-full bg-bg border-2 border-blue/40 rounded-card px-4 py-3.5 text-text text-base mb-4 outline-none focus:border-blue"
          placeholder="Например, «Терраса»"
          value={name}
          onChange={(e) => { setName(e.target.value); scrollSaveIntoView(); }}
          onFocus={scrollSaveIntoView}
          autoFocus
        />

        <label className="block text-xs text-text-dim mb-2 font-semibold">Иконка</label>
        <div className="grid grid-cols-6 gap-2 mb-5">
          {ROOM_ICON_LIST.map((k) => {
            const I = ROOM_ICONS[k];
            return (
              <button
                key={k}
                className={
                  "flex items-center justify-center w-full min-h-[48px] rounded-card transition-colors " +
                  (icon === k
                    ? "bg-blue text-white"
                    : "bg-bg text-text-dim border border-surface-hover hover:border-blue")
                }
                onClick={() => setIcon(k)}
              >
                <I size={20} strokeWidth={1.6} />
              </button>
            );
          })}
        </div>

        <button
          className={"ar-save-btn w-full min-h-[56px] rounded-btn font-semibold text-base flex items-center justify-center gap-2 transition-colors " +
            (name.trim() ? "bg-blue text-white tap-active" : "bg-surface-hover text-text-dim cursor-not-allowed")}
          disabled={!name.trim()}
          onClick={() => onConfirm({ name: name.trim(), icon })}
        >
          <Check size={18} strokeWidth={2.5} />
          {isEdit ? "Сохранить" : "Создать комнату"}
        </button>
      </div>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-slide-up { animation: slideUp 0.25s ease-out; }
        .tap-active { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}
