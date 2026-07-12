import React, { useState, useEffect, useCallback } from "react";
import { KeyRound, CircleCheck, CircleX, Loader2, Eye, EyeOff, RadioTower } from "lucide-react";
import { setApiKey, getApiKey } from "../api/client";
import { useMode } from "../hooks/useMode";

/**
 * Секция "Подключение к серверу" — закрывает находку из аудита:
 * до этого компонента в приложении не было НИ ОДНОГО способа ввести
 * X-API-Key, при этом ни один запрос его не отправлял.
 *
 * ИСПРАВЛЕНО (самопроверка): первая версия этого компонента заново
 * реализовывала fetchMode/switchMode самостоятельно — но в кодовой базе
 * уже существует правильный, рабочий hooks/useMode.ts (используется в
 * Dashboard.tsx), которому не хватало только X-API-Key (тоже исправлено).
 * Не плодим пятую копию одной и той же логики — используем существующий хук.
 */

type ConnectionStatus = "unknown" | "checking" | "ok" | "error";

async function checkConnection(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/status", { headers: { "X-API-Key": key } });
    if (res.status === 401) return { ok: false, error: "Неверный ключ (401)" };
    if (!res.ok) return { ok: false, error: `Сервер ответил ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Нет соединения с сервером" };
  }
}

export default function ConnectionSettings({ onModeChanged }: { onModeChanged?: (mode: "live" | "demo") => void }) {
  const [keyInput, setKeyInput] = useState(getApiKey());
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("unknown");
  const [errorMsg, setErrorMsg] = useState("");
  const { mode, toggle, loading: switching } = useMode();

  const refreshStatus = useCallback(async (key: string) => {
    if (!key) { setStatus("unknown"); return; }
    setStatus("checking");
    const result = await checkConnection(key);
    if (result.ok) {
      setStatus("ok");
      setErrorMsg("");
    } else {
      setStatus("error");
      setErrorMsg(result.error || "Ошибка подключения");
    }
  }, []);

  useEffect(() => {
    const existing = getApiKey();
    if (existing) refreshStatus(existing);
  }, [refreshStatus]);

  const handleSave = async () => {
    setApiKey(keyInput.trim());
    await refreshStatus(keyInput.trim());
  };

  const handleToggleMode = async () => {
    await toggle();
    onModeChanged?.(mode === "live" ? "demo" : "live");
  };

  return (
    <div className="se-manage-section">
      <div className="se-manage-head"><KeyRound size={14} strokeWidth={1.8} color="#C9A24B" /> Подключение к серверу</div>
      <div className="se-manage-caption">
        Ключ доступа (X-API-Key) — без него приложение не сможет управлять
        устройствами. Задаётся администратором сервера (переменная API_KEYS).
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type={showKey ? "text" : "password"}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Вставьте ключ доступа"
            className="se-input"
            style={{ width: "100%", paddingRight: 36 }}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#8a8f85" }}
            aria-label={showKey ? "Скрыть ключ" : "Показать ключ"}
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <button className="se-primary-btn" onClick={handleSave} disabled={!keyInput.trim() || status === "checking"}>
          {status === "checking" ? <Loader2 size={14} className="se-spin" /> : "Сохранить"}
        </button>
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
        {status === "ok" && <><CircleCheck size={15} color="#5CC98A" /> <span style={{ color: "#5CC98A" }}>Подключено</span></>}
        {status === "error" && <><CircleX size={15} color="#E0665A" /> <span style={{ color: "#E0665A" }}>{errorMsg}</span></>}
        {status === "checking" && <><Loader2 size={14} className="se-spin" /> <span>Проверка...</span></>}
        {status === "unknown" && <span style={{ color: "#8a8f85" }}>Ключ не задан</span>}
      </div>

      {status === "ok" && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Режим сервера</div>
              <div style={{ fontSize: 11.5, color: "#8a8f85", marginTop: 2 }}>
                {mode === "live"
                  ? "Live — реальные устройства через Zigbee2MQTT"
                  : "Demo — симулированные данные, реальные устройства не используются"}
              </div>
            </div>
            <button
              className="se-mode-pill"
              onClick={handleToggleMode}
              disabled={switching}
              style={{ cursor: switching ? "default" : "pointer" }}
            >
              {switching ? <Loader2 size={14} className="se-spin" /> : <RadioTower size={14} />}
              <span className={"se-mode-dot" + (mode === "live" ? " se-mode-dot--live" : "")} />
              {mode === "live" ? "Live" : "Demo"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
