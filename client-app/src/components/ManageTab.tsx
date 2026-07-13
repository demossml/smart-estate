import React from "react";
import { Plus, Trash2, RadioTower, Bot, Check, X, Loader2, CircleCheck, CircleX, KeyRound, ShieldCheck, Mic, Sparkles, Inbox, Home, DoorOpen, Sofa, Bed, UtensilsCrossed, TreePine } from "lucide-react";
import { DEVICE_TYPES } from "./DeviceTile";
import { ROOM_ICONS, ROOM_ICON_LIST } from "./HomeWidgets";
import RoomDevicesManager from "./RoomDevicesManager";
import ConnectionSettings from "./ConnectionSettings";

/* ---- AI_PROVIDERS ---- */
const AI_PROVIDERS_LIST = [
  { id: "anthropic", name: "Anthropic Claude", needsBaseUrl: false, models: ["claude-sonnet-5", "claude-haiku-4-5"] },
  { id: "openai", name: "OpenAI", needsBaseUrl: false, models: ["gpt-5.1", "gpt-5.1-mini"] },
  { id: "openrouter", name: "OpenRouter", needsBaseUrl: false, models: ["множество моделей на выбор"] },
  { id: "ollama", name: "Ollama (локально)", needsBaseUrl: true, models: ["своя локальная модель"] },
];

/* ---- Voice NLU classifier ---- */
const VERB_ON = ["включи", "включить", "запусти", "открой", "открыть"];
const VERB_OFF = ["выключи", "выключить", "останови", "закрой", "закрыть"];

export function classifyVoiceCommand(text: string, devices: any[]): any {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  const device = devices.find((d) => t.includes(d.name.toLowerCase()));
  const hasOn = VERB_ON.some((v) => t.includes(v));
  const hasOff = VERB_OFF.some((v) => t.includes(v));

  if (device && (hasOn || hasOff) && ["light", "plug", "gate_controller", "gate", "climate"].includes(device.type)) {
    return {
      handled: true,
      deviceId: device.id,
      newState: (device.type === "gate_controller" || device.type === "gate") ? (hasOn ? "open" : "closed") : hasOn,
      resultText: `Выполнено локально по grammar-интенту NLU (без AI): «${device.name}» → ${hasOn ? "включено" : "выключено"}.`,
    };
  }
  if (t.includes("холодно")) {
    return {
      handled: false,
      aiText: "Понял как жалобу на температуру, не команду. В доме сейчас включён кондиционер в гостиной — предлагаю поднять целевую температуру на 1.5°, а не включать обогрев везде.",
      suggestion: { kind: "climate_bump", roomHint: "Гостиная", text: "Поднять температуру в «Гостиной» на 1.5°, потому что вы сказали «холодно»" },
    };
  }
  if (t.includes("жарко")) {
    return {
      handled: false,
      aiText: "Жалоба на духоту. Проверил датчики: окно в гостиной открыто, а кондиционер работает — это конфликт, предлагаю выключить кондиционер вместо того, чтобы охлаждать улицу.",
      suggestion: { kind: "climate_off", roomHint: "Гостиная", text: "Выключить кондиционер в «Гостиной», раз окно открыто" },
    };
  }
  if (t.includes("гост") || t.includes("калитк") || t.includes("ворот")) {
    return {
      handled: false,
      aiText: "Это похоже на просьбу впустить кого-то, а не прямую команду — открывать ворота без подтверждения я не буду, это необратимое действие.",
      suggestion: { kind: "gate_open", roomHint: "Двор", text: "Открыть въездные ворота" },
    };
  }
  return {
    handled: false,
    aiText: "Не нашёл явного устройства и глагола в фразе — с фиксированной grammar это тупик. Передал бы контекст (комнаты, датчики, активные сценарии) языковой модели и получил структурированное действие через function calling.",
    suggestion: null,
  };
}

/* ---- ManageTab ---- */
interface VoiceState {
  enabled: boolean;
  onToggleEnabled: () => void;
  command: string;
  onCommandChange: (v: string) => void;
  onSubmitCommand: () => void;
  log: { id: string; role: string; text: string }[];
  pendingActions: { id: string; text: string; kind?: string }[];
  onConfirmAction: (id: string) => void;
  onDismissAction: (id: string) => void;
  suggestions: { id: string; text: string; condition?: string; action?: string }[];
  onAcceptSuggestion: (id: string) => void;
  onDismissSuggestion: (id: string) => void;
  briefing: string;
}
interface ManageTabProps {
  rooms: any[];
  devices: any[];
  onAddRoom: () => void;
  onDeleteRoom: (id: string) => void;
  onAddDeviceManually: () => void;
  onSaveParams: (id: string, params: Record<string, any>) => void;
  onRemoveFromRoom: (id: string) => void;
  onDeleteDevice: (id: string) => void;
  onAddDevice: (device: { type: string; name: string; params: Record<string, any> }) => void;
  discovering: boolean;
  discoveredDevices: any[];
  secondsLeft: number;
  onStartDiscovery: () => void;
  onStopDiscovery: () => void;
  onAssignDiscovered: (d: any) => void;
  onDismissDiscovered: (tempId: string) => void;
  aiConfig: any;
  onAiChange: (patch: any) => void;
  onTestConnection: () => void;
  onDisconnectAi: () => void;
  onToggleAiScenarios: () => void;
  voice: VoiceState;
}

export default function ManageTab({
  rooms, devices, onAddRoom, onDeleteRoom, onAddDeviceManually,
  onSaveParams, onRemoveFromRoom, onDeleteDevice, onAddDevice,
  discovering, discoveredDevices, secondsLeft,
  onStartDiscovery, onStopDiscovery, onAssignDiscovered, onDismissDiscovered,
  aiConfig, onAiChange, onTestConnection, onDisconnectAi, onToggleAiScenarios,
  voice,
}: ManageTabProps) {
  const providerMeta = AI_PROVIDERS_LIST.find((p) => p.id === aiConfig.providerId);

  return (
    <div className="se-tab-pad">
      <div className="se-tab-title">Управление</div>
      <div className="se-tab-caption">Комнаты, устройства, поиск, AI-агент</div>

      <ConnectionSettings onModeChanged={() => window.location.reload()} />

      {/* ROOMS & DEVICES */}
      <div className="se-manage-section">
        <div className="se-manage-head">Комнаты и устройства</div>
        {rooms.map((room: any) => (
          <RoomDevicesManager
            key={room.id}
            room={room}
            devices={devices.filter((d: any) => String(d.room_id) === room.id)}
            onAddDevice={onAddDevice}
            onSaveParams={onSaveParams}
            onRemoveFromRoom={onRemoveFromRoom}
            onDeleteDevice={onDeleteDevice}
          />
        ))}
        <button className="se-outline-btn" onClick={onAddRoom} style={{ marginTop: 12 }}><Plus size={14} strokeWidth={2} /> Добавить комнату</button>
      </div>

      {/* DISCOVERY */}
      <div className="se-manage-section">
        <div className="se-manage-head"><RadioTower size={14} strokeWidth={1.8} color="#C9A24B" /> Поиск новых устройств</div>
        <div className="se-manage-caption">
          Открывает Zigbee-сеть для подключения (permit_join) на 254 сек, как в Zigbee2MQTT.
          Новые устройства регистрируют себя сами (device_announce) — их останется назвать и распределить по комнатам.
        </div>

        {!discovering ? (
          <button className="se-primary-btn se-primary-btn--wide" onClick={onStartDiscovery}>
            <RadioTower size={14} strokeWidth={2} /> Начать поиск устройств
          </button>
        ) : (
          <div className="se-discovery-panel">
            <div className="se-discovery-status">
              <span className="se-discovery-dot" />
              Сеть открыта · осталось {secondsLeft} сек
            </div>
            <div className="se-discovery-bar"><div className="se-discovery-bar-fill" style={{ width: `${(secondsLeft / 60) * 100}%` }} /></div>
            <button className="se-outline-btn se-outline-btn--danger" onClick={onStopDiscovery}>Остановить поиск</button>
          </div>
        )}

        {discoveredDevices.length > 0 && (
          <div className="se-found-list">
            {discoveredDevices.map((d: any) => {
              const meta = DEVICE_TYPES[d.type];
              const Icon = meta?.icon || (({ size }: any) => null);
              return (
                <div className="se-found-item" key={d.tempId || d.ieee}>
                  <div className="se-tile-icon"><Icon size={16} strokeWidth={1.6} /></div>
                  <div className="se-found-item-text">
                    <div className="se-found-type">{meta?.label || d.type}</div>
                    <div className="se-found-ieee">{d.ieee}</div>
                  </div>
                  <button className="se-mini-btn" onClick={() => onAssignDiscovered(d)}>Добавить</button>
                  <button className="se-icon-btn" onClick={() => onDismissDiscovered(d.tempId)}><X size={13} strokeWidth={1.8} /></button>
                </div>
              );
            })}
          </div>
        )}

        <button className="se-text-link" onClick={onAddDeviceManually}>
          Устройство не находится автоматически? Добавить вручную
        </button>
      </div>

      {/* AI AGENT */}
      <div className="se-manage-section">
        <div className="se-manage-head"><Bot size={14} strokeWidth={1.8} color="#C9A24B" /> AI-агент</div>
        <div className="se-manage-caption">
          Подключите собственного AI-провайдера своим токеном. Токен хранится только на сервере в зашифрованном виде и не передаётся обратно в приложение.
        </div>

        {aiConfig.status === "connected" ? (
          <div className="se-ai-connected">
            <div className="se-ai-connected-row">
              <CircleCheck size={16} strokeWidth={1.8} color="#7FE0A8" />
              <span>{providerMeta?.name} подключен</span>
            </div>
            <div className="se-field-label" style={{ marginTop: 12 }}>Модель</div>
            <select className="se-input" value={aiConfig.model} onChange={(e) => onAiChange({ model: e.target.value })}>
              {providerMeta?.models.map((m: string) => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="se-ai-toggle-row">
              <span>Использовать AI в сценариях</span>
              <button className={"se-switch" + (aiConfig.useInScenarios ? " se-switch--on" : "")} onClick={onToggleAiScenarios}><span className="se-switch-knob" /></button>
            </div>
            <button className="se-outline-btn se-outline-btn--danger" onClick={onDisconnectAi}>Отключить провайдера</button>
          </div>
        ) : (
          <>
            <div className="se-provider-grid">
              {AI_PROVIDERS_LIST.map((p) => (
                <button key={p.id} className={"se-type-btn" + (aiConfig.providerId === p.id ? " se-type-btn--active" : "")} onClick={() => onAiChange({ providerId: p.id })}>
                  <Bot size={17} strokeWidth={1.5} /><span>{p.name}</span>
                </button>
              ))}
            </div>

            {aiConfig.providerId && (
              <>
                <label className="se-field-label"><KeyRound size={11} strokeWidth={2} style={{ verticalAlign: "-1px", marginRight: 4 }} />API-токен</label>
                <input className="se-input" type="password" placeholder="sk-…" value={aiConfig.token} onChange={(e) => onAiChange({ token: e.target.value })} />

                {providerMeta?.needsBaseUrl && (
                  <>
                    <label className="se-field-label">Адрес сервера</label>
                    <input className="se-input" placeholder="http://localhost:11434" value={aiConfig.baseUrl} onChange={(e) => onAiChange({ baseUrl: e.target.value })} />
                  </>
                )}

                {aiConfig.status === "testing" ? (
                  <button className="se-primary-btn" disabled><Loader2 size={14} strokeWidth={2} className="se-spin" /> Проверка соединения…</button>
                ) : aiConfig.status === "error" ? (
                  <>
                    <div className="se-ai-error"><CircleX size={13} strokeWidth={1.8} color="#D9695F" /> Не удалось подключиться. Проверьте токен.</div>
                    <button className="se-primary-btn" onClick={onTestConnection} disabled={!aiConfig.token.trim()}>Повторить попытку</button>
                  </>
                ) : (
                  <button className="se-primary-btn" onClick={onTestConnection} disabled={!aiConfig.token.trim()}>
                    <ShieldCheck size={14} strokeWidth={2} /> Проверить и подключить
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* VOICE / HERMES */}
      <div className="se-manage-section se-manage-section--last">
        <div className="se-manage-head"><Mic size={14} strokeWidth={1.8} color="#C9A24B" /> Голосовое управление (Hermes)</div>
        <div className="se-manage-caption">
          Wake word → ASR → NLU идут по фиксированной грамматике локально, бесплатно и без AI.
          Agent подключается, только если фразу нельзя разложить на «устройство + действие» — то есть
          там, где реально нужно рассуждение, а не только когда получится порисоваться.
        </div>

        <div className="se-hermes-pipeline">
          {["Hotword", "ASR", "NLU", "AI-агент"].map((step, i) => (
            <React.Fragment key={step}>
              <span className={"se-hermes-step" + (i === 3 && aiConfig.status !== "connected" ? " se-hermes-step--off" : "")}>{step}</span>
              {i < 3 && <span className="se-hermes-arrow">→</span>}
            </React.Fragment>
          ))}
        </div>

        <div className="se-ai-toggle-row" style={{ marginBottom: 14 }}>
          <span>Голосовое управление включено</span>
          <button className={"se-switch" + (voice.enabled ? " se-switch--on" : "")} onClick={voice.onToggleEnabled}><span className="se-switch-knob" /></button>
        </div>

        {voice.enabled && (
          <>
            {aiConfig.status !== "connected" && (
              <div className="se-ai-error" style={{ marginBottom: 10 }}>
                <CircleX size={13} strokeWidth={1.8} color="#D9695F" /> AI не подключен выше — сложные фразы будут падать в тупик без интерпретации.
              </div>
            )}

            <label className="se-field-label">Проверить фразу (эмуляция hermes/asr/textCaptured)</label>
            <div className="se-voice-test-row">
              <input className="se-input" placeholder="например: «в гостиной холодно»"
                value={voice.command}
                onChange={(e) => voice.onCommandChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && voice.onSubmitCommand()}
              />
              <button className="se-mini-btn" onClick={voice.onSubmitCommand}>Отправить</button>
            </div>

            {voice.log.length > 0 && (
              <div className="se-voice-log">
                {voice.log.map((l) => (
                  <div key={l.id} className={"se-voice-log-row se-voice-log-row--" + l.role}>
                    {l.role === "ai" && <Sparkles size={12} strokeWidth={1.8} />}
                    <span>{l.text}</span>
                  </div>
                ))}
              </div>
            )}

            {voice.pendingActions.length > 0 && (
              <>
                <div className="se-section-label" style={{ margin: "16px 0 8px" }}><Inbox size={12} strokeWidth={2} /> Ждут подтверждения</div>
                <div className="se-pending-list">
                  {voice.pendingActions.map((a) => (
                    <div className="se-pending-row" key={a.id}>
                      <span className="se-pending-text">{a.text}</span>
                      <div className="se-pending-btns">
                        <button className="se-mini-btn" onClick={() => voice.onConfirmAction(a.id)}>Да</button>
                        <button className="se-icon-btn" onClick={() => voice.onDismissAction(a.id)}><X size={13} strokeWidth={1.8} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {voice.suggestions.length > 0 && (
              <>
                <div className="se-section-label" style={{ margin: "16px 0 8px" }}><Sparkles size={12} strokeWidth={2} /> Предложения по паттернам</div>
                <div className="se-pending-list">
                  {voice.suggestions.map((s) => (
                    <div className="se-pending-row" key={s.id}>
                      <span className="se-pending-text">{s.text}</span>
                      <div className="se-pending-btns">
                        <button className="se-mini-btn" onClick={() => voice.onAcceptSuggestion(s.id)}>Создать</button>
                        <button className="se-icon-btn" onClick={() => voice.onDismissSuggestion(s.id)}><X size={13} strokeWidth={1.8} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="se-section-label" style={{ margin: "16px 0 8px" }}>Сводка за сегодня</div>
            <div className="se-briefing">{voice.briefing}</div>
          </>
        )}
      </div>
    </div>
  );
}
