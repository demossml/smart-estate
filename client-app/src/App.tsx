import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Home, Workflow, Zap, Settings, Plus, Wind, Loader2, CheckCircle2 } from "lucide-react";
import RoomCard from "./components/RoomCard";
import DeviceTile, { airStatus, DEVICE_TYPES, defaultFieldsFor } from "./components/DeviceTile";
import AddDeviceModal from "./components/AddDeviceModal";
import AddRoomModal from "./components/AddRoomModal";
import ScenariosTab from "./components/ScenariosTab";
import EnergyTab from "./components/EnergyTab";
import DeviceDetailSheet from "./components/DeviceDetailSheet";
import AssignDiscoveredModal from "./components/AssignDiscoveredModal";
import { StatusStrip, FavoritesGrid, RunningNow, ROOM_ICONS } from "./components/HomeWidgets";
import ManageTab, { classifyVoiceCommand } from "./components/ManageTab";
import ZigbeeStatusIndicator from "./components/ZigbeeStatusIndicator";
import { useMode } from './hooks/useMode';

// ── CSRF ──
let csrfToken = '';
async function initCSRF() {
  try {
    const res = await fetch('/api/csrf-token', { headers: { 'X-API-Key': localStorage.getItem('apiKey') || '' } });
    const data = await res.json();
    csrfToken = data.token || '';
  } catch {}
}
initCSRF();

async function apiSimple(path: string, options?: RequestInit) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': localStorage.getItem('apiKey') || '',
  };
  const method = options?.method || 'GET';
  if (csrfToken && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) headers['X-CSRF-Token'] = csrfToken;
  const res = await fetch(`/api${path}`, { headers, ...options });
  if (!res.ok) {
    let msg = `API ${res.status}`;
    try {
      const body = await res.clone().json();
      if (body?.error) msg = body.error;
    } catch { /* тело не JSON */ }
    throw new Error(msg);
  }
  return res.json();
}
const api = apiSimple;

const FONT_IMPORT =
  "https://fonts.googleapis.com/css2?family=Cormorant+SC:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";

const ICON_MAP: Record<string, string> = {
  armchair: 'living', 'cooking-pot': 'kitchen', bed: 'bedroom', hallway: 'hallway', yard: 'yard', sofa: 'living',
};
function mapIcon(dbIcon: string | null): string { return ICON_MAP[dbIcon || ''] || 'living'; }

function apiToDevice(d: any): any {
  const tel: Record<string, any> = {};
  for (const t of (d.latest_telemetry || [])) tel[t.property] = t.value;
  const base: any = {
    id: d.ieee_addr, roomId: String(d.room_id || ''),
    type: d.type, name: (d.friendly_name || d.ieee_addr || 'device').trim(),
    battery: d.battery ?? tel.battery ?? null,
    linkquality: d.linkquality ?? tel.linkquality ?? null,
  };
  switch (d.type) {
    case 'window_sensor': case 'door_sensor': base.contact = tel.contact === 1 || tel.contact === true ? 'open' : 'closed'; break;
    case 'presence_sensor': case 'motion_sensor':
      base.presence = tel.presence === 1 || tel.presence === true;
      base.lastSeenMin = d.last_presence_minutes;
      // mmWave-поля из raw_json (через телеметрию)
      base.detectionDistance = tel.detection_distance ?? null;
      base.fadingTime = tel.fading_time ?? null;
      base.motionSensitivity = tel.motion_detection_sensitivity ?? null;
      base.staticSensitivity = tel.static_detection_sensitivity ?? null;
      base.antiInterference = tel.anti_interference ?? null;
      break;
    case 'leak_sensor': base.leak = tel.water_leak === 1 || tel.water_leak === true; break;
    case 'air_monitor': base.temperature = tel.temperature ?? 0; base.humidity = tel.humidity ?? 0; base.co2 = tel.co2 ?? 0; base.voc = tel.voc ?? 0; break;
    case 'light': base.state = tel.state === 1 || tel.state === true; base.brightness = tel.brightness ?? 0; break;
    case 'plug': base.state = tel.state === 1 || tel.state === true; base.ratedPower = tel.power ?? tel.ratedPower ?? 0; base.energy = tel.energy ?? 0; base.current = tel.current ?? 0; break;
    case 'gate_controller': base.state = tel.contact === 1 ? 'open' : 'closed'; break;
    case 'climate': base.state = tel.state === 1 || tel.state === true; base.targetTemp = tel.targetTemp ?? tel.temperature ?? 22; break;
  }
  return base;
}

function apiToScenario(s: any): any {
  let condition = s.name || s.description || '';
  let action = '';
  try {
    const desc = s.description || '';
    const arrow = desc.indexOf('→');
    if (arrow > 0) { condition = desc.slice(0, arrow).trim(); action = desc.slice(arrow + 1).trim(); }
    else { action = desc; }
  } catch {}
  return { id: String(s.id), condition, action, active: s.active !== false };
}
const uid = () => Math.random().toString(36).slice(2, 9);

/* ———————————————————————— App ———————————————————————— */
export default function SmartEstateApp() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState("home");
  const [loading, setLoading] = useState(true);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [presetRoomId, setPresetRoomId] = useState<number | null>(null);
  const [detailDevice, setDetailDevice] = useState<any>(null);
  const { mode, toggle: toggleMode, loading: modeLoading } = useMode();

  // ── Discovery state — новая логика (14.07.2026) ──
  const [discoveredDevices, setDiscoveredDevices] = useState<any[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [assigningDevice, setAssigningDevice] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timersRef = useRef<any[]>([]);

  // AI agent state
  const [aiConfig, setAiConfig] = useState({ providerId: null as string | null, token: "", baseUrl: "", status: "disconnected", model: "", useInScenarios: false });

  // voice / Hermes state
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceCommand, setVoiceCommand] = useState("");
  const [voiceLog, setVoiceLog] = useState<any[]>([]);
  const [pendingActions, setPendingActions] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  /* ─── Load data ─── */
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [roomsData, devicesData, scenariosData] = await Promise.all([
        api('/rooms'), api('/devices'), api('/scenarios'),
      ]);
      const loadedRooms = (roomsData.rooms || []).map((r: any) => ({ ...r, icon: mapIcon(r.icon), id: String(r.id) }));
      setRooms(loadedRooms);
      setDevices((devicesData.devices || []).map((d: any) => {
        // Normalize server fields for frontend
        const tel: Record<string, any> = {};
        for (const t of (d.latest_telemetry || [])) tel[t.property] = t.value;
        const isMotion = d.type === 'presence_sensor' || d.type === 'motion_sensor';
        const presenceDetected = isMotion && (
          tel.presence === 1 || tel.presence === true ||
          tel.presence === '1' || tel.presence === 'present'
        );
        return {
          ...d,
          id: d.id ?? d.ieee_addr,
          presence: presenceDetected,
          lastSeenMin: d.last_presence_minutes ?? null,
          last_presence_minutes: d.last_presence_minutes ?? null,
          battery: d.battery ?? tel.battery ?? (d.status === 'online' ? 100 : 0),
          linkquality: d.linkquality ?? tel.linkquality ?? 0,
          temperature: d.temperature ?? tel.temperature,
          humidity: d.humidity ?? tel.humidity,
          co2: d.co2 ?? tel.co2,
          contact: d.contact ?? tel.contact,
          state: d.state ?? tel.state,
        };
      }));
      setScenarios((scenariosData.scenarios || []).map(apiToScenario));
      if (loadedRooms.length > 0) setExpanded({ [loadedRooms[0].id]: true });
    } catch (e: any) { console.error('Load error:', e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);

  /* ─── Air ─── */
  const overallAir = useMemo(() => {
    const airs = devices.filter((d: any) => d.type === "air_monitor");
    if (!airs.length) return null;
    const tel: Record<string, any> = {};
    for (const t of (airs[0].latest_telemetry || [])) tel[t.property] = t.value;
    return airStatus(tel.co2 || 0);
  }, [devices]);

  /* ─── Total power ─── */
  const totalPower = useMemo(() => {
    return devices.filter((d: any) => d.type === 'plug').reduce((sum: number, p: any) => {
      const tel: Record<string, any> = {};
      for (const t of (p.latest_telemetry || [])) tel[t.property] = t.value;
      return sum + (tel.state ? (tel.power || tel.ratedPower || 0) : 0);
    }, 0);
  }, [devices]);

  /* ─── Rooms with devices ─── */
  const roomsWithDevices = useMemo(() => {
    return rooms.filter((r: any) => devices.some((d: any) => String(d.room_id) === String(r.id)));
  }, [rooms, devices]);

  /* ─── Callbacks (real API) ─── */
  const toggleDevice = useCallback(async (id: string, explicitValue?: string) => {
    try {
      // Find device type from local state
      const device = devices.find((d: any) => d.ieee_addr === id);
      if (!device?.type) return;
      
      if (device.type === 'gate_controller' || device.type === 'lock') {
        const action = explicitValue || (device.state === 'open' ? 'close' : 'open');
        await api(`/gates/${id}/${action}`, { method: 'POST', body: JSON.stringify({ reason: 'Приложение' }) });
      } else {
        const action = (explicitValue !== undefined ? !!explicitValue : !device.state) ? 'on' : 'off';
        await api(`/devices/${id}/${action}`, { method: 'POST' });
      }
      await loadData();
    } catch (e: any) {
      console.error('Toggle error:', e);
    }
  }, [devices, loadData]);

  const adjustTemp = useCallback(async (id: string, delta: number) => {
    try {
      const device = devices.find((d: any) => d.ieee_addr === id);
      if (!device) return;
      const newTemp = Math.min(28, Math.max(16, (device.targetTemp || 22) + delta));
      await api(`/climate/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ target_temp: newTemp }),
      });
      await loadData();
    } catch (e: any) {
      console.error('Adjust temp error:', e);
    }
  }, [devices, loadData]);

  const setSlider = useCallback(async (id: string, field: string, value: number) => {
    try {
      // For brightness, update device
      if (field === 'brightness') {
        await api(`/devices/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ friendly_name: undefined, type: undefined, room_id: undefined }),
        });
      }
      // Optimistic update + reload
      setDevices((prev) => prev.map((d: any) => 
        d.ieee_addr === id && d.type === 'light' ? { ...d, state: value > 0, brightness: value } : d
      ));
    } catch (e: any) {
      console.error('Slider error:', e);
    }
  }, []);

  const openAddDevice = (roomId: number | null) => { setPresetRoomId(roomId); setShowAddDevice(true); };

  const confirmAddDevice = async ({ ieee_addr, type, name, roomMode, roomId, newRoomName, newRoomIcon }: any) => {
    try {
      let targetRoomId = roomId;
      if (roomMode === "new") {
        const roomRes = await api('/rooms', { method: 'POST', body: JSON.stringify({ name: newRoomName, icon: newRoomIcon }) });
        targetRoomId = String(roomRes.room?.id || roomRes.id);
      }
      await api('/devices', { method: 'POST', body: JSON.stringify({ ieee_addr, friendly_name: name, type, room_id: targetRoomId }) });
      await loadData();
      setShowAddDevice(false);
    } catch (e: any) {
      alert('Ошибка при добавлении устройства: ' + (e.message || 'неизвестная ошибка'));
      console.error('Add device error:', e);
    }
  };

  const confirmAddRoom = async ({ name, icon }: any) => {
    try { await api('/rooms', { method: 'POST', body: JSON.stringify({ name, icon }) }); await loadData(); }
    catch (e: any) { console.error('Add room error:', e); }
    setShowAddRoom(false);
  };

  const addScenario = async (condition: string, action: string) => {
    try {
      await api('/scenarios', { method: 'POST', body: JSON.stringify({ name: condition.slice(0, 60), description: `${condition} → ${action}`, triggers_json: '{}', actions_json: '{}' }) });
      await loadData();
    } catch {}
  };
  const toggleScenario = useCallback(async (id: string) => {
    try {
      await api(`/scenarios/${id}/toggle`, { method: 'POST' });
      await loadData();
    } catch (e: any) { console.error('Toggle scenario error:', e); }
  }, [loadData]);
  const deleteScenario = useCallback(async (id: string) => {
    try {
      await api(`/scenarios/${id}`, { method: 'DELETE' });
      await loadData();
    } catch (e: any) { console.error('Delete scenario error:', e); }
  }, [loadData]);
  const deleteDevice = useCallback(async (id: string) => {
    try { await api(`/devices/${id}`, { method: 'DELETE' }); await loadData(); }
    catch (e: any) { console.error('Delete device error:', e); }
  }, [loadData]);

  // ── Device params (config, RoomDevicesManager) ──
  const saveDeviceParams = useCallback(async (id: string, params: Record<string, any>) => {
    try {
      await api(`/devices/${id}/params`, { method: 'PATCH', body: JSON.stringify(params) });
      await loadData();
    } catch (e: any) { console.error('Save params error:', e); }
  }, [loadData]);

  const removeDeviceFromRoom = useCallback(async (id: string) => {
    try {
      await api(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify({ room_id: null }) });
      await loadData();
    } catch (e: any) { console.error('Remove from room error:', e); }
  }, [loadData]);

  // ── Add device to room (RoomDevicesManager) — Модуль 8, Находка 24 ──
  const addDeviceToRoom = useCallback(async ({ type, name, roomId }: { type: string; name: string; params: Record<string, any>; roomId?: string | number }) => {
    try {
      const ieee_addr = `manual:${Date.now()}`;
      await api('/devices', {
        method: 'POST',
        body: JSON.stringify({ ieee_addr, friendly_name: name, type, room_id: roomId || null }),
      });
      await loadData();
    } catch (e: any) {
      alert('Ошибка при добавлении устройства: ' + (e.message || 'неизвестная ошибка'));
      console.error('Add device to room error:', e);
    }
  }, [loadData]);
  const deleteRoom = useCallback(async (id: string) => {
    try { await api(`/rooms/${id}`, { method: 'DELETE' }); await loadData(); }
    catch (e: any) { console.error('Delete room error:', e); }
  }, [loadData]);

  /* ── Discovery — НОВАЯ ЛОГИКА (14.07.2026) ──
   *
   * НОВАЯ ФИЛОСОФИЯ:
   *   - Пользователь всегда видит ВСЕ Zigbee-устройства из Z2M
   *   - Нет разделения pending/confirmed
   *   - Для каждого устройства: is_added (уже в БД), can_edit (всегда true)
   *   - Если permit_join активен — polling /api/devices/pending каждые 4 сек
   *   - Если нет — показываем последний полученный список (пользователь может
   *     обновить вручную)
   */
  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };

  // Загрузить список всех устройств из /api/devices/pending
  const loadPending = useCallback(async () => {
    try {
      const data = await api('/devices/pending');
      const devices = data.devices || data.pending || [];
      if (devices.length > 0 || !data.pending) {
        setDiscoveredDevices(devices.map((p: any) => ({
          tempId: uid(),
          ieee: p.ieee_address,
          type: p.suggested_type || 'sensor',
          suggestedName: p.friendly_name || p.ieee_address,
          is_added: p.is_added,
          can_edit: p.can_edit,
          friendly_name: p.friendly_name,
          room_id: p.room_id,
          model: p.model,
          vendor: p.vendor,
        })));
      }
    } catch {}
  }, []);

  const startDiscovery = async () => {
    setDiscovering(true); setSecondsLeft(120); clearTimers();
    try {
      await api('/discovery/start', { method: 'POST' });
    } catch (e: any) {
      console.error('Discovery start error:', e);
    }
    await loadPending();
    const tick = setInterval(async () => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(tick); setDiscovering(false); return 0; }
        return s - 1;
      });
      await loadPending();
    }, 4000);
    timersRef.current.push(tick);
  };

  const stopDiscovery = async () => {
    clearTimers(); setDiscovering(false); setSecondsLeft(0);
    try { await api('/discovery/stop', { method: 'POST' }); } catch {}
    await loadPending();
  };

  const dismissDiscovered = (tempId: string) =>
    setDiscoveredDevices((prev) => prev.filter((d) => d.tempId !== tempId));

  const confirmAssignDiscovered = async ({ name, roomId }: any) => {
    if (!assigningDevice) return;
    const ieee = assigningDevice.ieee_address || assigningDevice.ieee;
    try {
      const res = await api(`/discovery/${ieee}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          roomId: roomId || null,
          type: assigningDevice.suggested_type || assigningDevice.type || null,
        }),
      });
      // Force-refetch всех данных: комнаты, устройства, сценарии
      await loadData();
      // Дополнительно — перезагружаем список обнаруженных устройств
      try {
        const pendingRes = await api('/devices/pending');
        setDiscoveredDevices((pendingRes.devices || pendingRes.items || []).map((d: any) => ({
          ...d,
          ieee: d.ieee_address || d.ieee,
          tempId: d.ieee_address || d.ieee,
        })));
      } catch {}
      setAssigningDevice(null);
      setToast(assigningDevice.is_added
        ? `✅ «${name}» обновлено`
        : `✅ «${name}» добавлено`
      );
      setTimeout(() => setToast(null), 3000);
    } catch (e: any) {
      console.error('Confirm error:', e);
      setToast(`❌ Ошибка: ${e.message}`);
      setTimeout(() => setToast(null), 3000);
    }
  };
  useEffect(() => () => clearTimers(), []);

  /* ── AI agent ── */
  const aiChange = (patch: any) => setAiConfig((prev) => ({ ...prev, ...patch, status: patch.token !== undefined || patch.providerId !== undefined ? "disconnected" : prev.status }));
  const testAiConnection = async () => {
    if (!aiConfig.providerId || !aiConfig.token.trim()) return;
    setAiConfig((prev) => ({ ...prev, status: "testing" }));
    try {
      // Create provider via API
      const res = await api('/ai/providers', {
        method: 'POST',
        body: JSON.stringify({
          provider: aiConfig.providerId,
          token: aiConfig.token,
          baseUrl: aiConfig.baseUrl || undefined,
          model: aiConfig.model || undefined,
        }),
      });
      if (res.ok && res.provider) {
        // Run test
        const testRes = await api(`/ai/providers/${res.provider.id}/test`, { method: 'POST' });
        setAiConfig((prev) => ({
          ...prev,
          status: testRes.test_ok ? "connected" : "error",
          model: prev.model || res.provider.model || "",
        }));
      } else {
        setAiConfig((prev) => ({ ...prev, status: "error" }));
      }
    } catch {
      setAiConfig((prev) => ({ ...prev, status: "error" }));
    }
  };
  const disconnectAi = async () => {
    // Delete providers from server
    try {
      const providers = await api('/ai/providers');
      for (const p of (providers.providers || [])) {
        await api(`/ai/providers/${p.id}`, { method: 'DELETE' });
      }
    } catch {}
    setAiConfig({ providerId: null, token: "", baseUrl: "", status: "disconnected", model: "", useInScenarios: false });
  };
  const toggleAiScenarios = async () => {
    const newVal = !aiConfig.useInScenarios;
    setAiConfig((prev) => ({ ...prev, useInScenarios: newVal }));
    // Update first provider
    try {
      const providers = await api('/ai/providers');
      if (providers.providers?.length > 0) {
        await api(`/ai/providers/${providers.providers[0].id}`, {
          method: 'PATCH',
          body: JSON.stringify({ useInScenarios: newVal }),
        });
      }
    } catch {}
  };

  /* ── Voice / Hermes ── */
  const submitVoiceCommand = () => {
    const text = voiceCommand.trim();
    if (!text) return;
    setVoiceLog((prev) => [...prev, { id: uid(), role: "user", text }]);
    const result = classifyVoiceCommand(text, devices.map(apiToDevice));
    if (result?.handled) {
      toggleDevice(result.deviceId, typeof result.newState === "string" ? result.newState : undefined);
      if (typeof result.newState === "boolean") {
        setDevices((prev) => prev.map((d) => (d.ieee_addr === result.deviceId ? { ...d, state: result.newState } : d)));
      }
      setVoiceLog((prev) => [...prev, { id: uid(), role: "system", text: result.resultText }]);
    } else if (result) {
      setVoiceLog((prev) => [...prev, { id: uid(), role: "ai", text: result.aiText }]);
      if (result.suggestion) {
        setPendingActions((prev) => [...prev, { id: uid(), text: result.suggestion.text, kind: result.suggestion.kind }]);
      }
    }
    setVoiceCommand("");
  };

  const confirmPendingAction = (id: string) => {
    const action = pendingActions.find((a) => a.id === id);
    if (action) {
      if (action.kind === "climate_bump") adjustTemp(devices.find((d: any) => d.type === "climate")?.ieee_addr, 1.5);
      if (action.kind === "climate_off") toggleDevice(devices.find((d: any) => d.type === "climate")?.ieee_addr);
      if (action.kind === "gate_open") toggleDevice(devices.find((d: any) => d.type === "gate_controller")?.ieee_addr, "open");
      if (action.kind === "kettle") toggleDevice(devices.find((d: any) => d.name === "Чайник")?.ieee_addr);
    }
    setPendingActions((prev) => prev.filter((a) => a.id !== id));
  };
  const dismissPendingAction = (id: string) => setPendingActions((prev) => prev.filter((a) => a.id !== id));

  const acceptSuggestion = (id: string) => {
    const s = suggestions.find((x: any) => x.id === id);
    if (s) setScenarios((prev) => [...prev, { id: uid(), condition: s.condition || s.text, action: s.action || "", active: true }]);
    setSuggestions((prev) => prev.filter((x) => x.id !== id));
  };
  const dismissSuggestion = (id: string) => setSuggestions((prev) => prev.filter((x) => x.id !== id));

  const dailyBriefing = useMemo(() => {
    const formatted = devices.map(apiToDevice);
    const kw = (formatted.filter((d: any) => d.type === "plug" && d.state).reduce((s: number, p: any) => s + p.ratedPower, 0) / 1000).toFixed(1);
    const openIssues = formatted.filter((d: any) => (d.type === "window_sensor" || d.type === "door_sensor") && d.contact === "open").length;
    const lightsOn = formatted.filter((d: any) => d.type === "light" && d.state).length;
    return `Сейчас дом потребляет ${kw} кВт, ${openIssues ? `открыто окон/дверей: ${openIssues}` : "все окна и двери закрыты"}, света горит: ${lightsOn}. За сегодня сработало автоматизаций: ${scenarios.filter((s) => s.active).length}, активных подсказок: ${suggestions.length + pendingActions.length}.`;
  }, [devices, scenarios, suggestions, pendingActions]);

  /* ── Render ── */
  if (loading) {
    return (
      <div className="se-stage">
        <div className="se-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <Loader2 size={32} strokeWidth={1.5} className="se-spin" color="#C9A24B" />
        </div>
      </div>
    );
  }

  return (
    <div className="se-stage">
      <link rel="stylesheet" href={FONT_IMPORT} />
      <style>{css}</style>

      <div className="se-app">
        {/* header */}
        <div className="se-header">
          <div>
            <div className="se-logo">УМНАЯ УСАДЬБА</div>
            <div className="se-logo-sub">SmartEstate · {roomsWithDevices.length} комнат · {devices.length} устройств</div>
          </div>
          <button className="se-mode-pill" onClick={async () => { await toggleMode(); await loadData(); }} disabled={modeLoading}>
            <span className={"se-mode-dot" + (mode === "live" ? " se-mode-dot--live" : "")} />
            {mode === "live" ? "Live" : "Demo"}
          </button>
          <ZigbeeStatusIndicator />
        </div>

        {tab === "home" && (
          <>
            <StatusStrip devices={devices.map(apiToDevice)} />
            <div className="se-tab-pad se-tab-pad--rooms">
              <FavoritesGrid devices={devices.map(apiToDevice)} onToggle={toggleDevice} onAdjustTemp={adjustTemp} onSlider={setSlider} onOpenDetail={setDetailDevice} />
              <RunningNow scenarios={scenarios} devices={devices.map(apiToDevice)} />
              <div className="se-section-label">Комнаты</div>
              {roomsWithDevices.map((room: any) => (
                <RoomCard
                  key={room.id} room={room}
                  devices={devices.filter((d: any) => String(d.room_id) === room.id).map(apiToDevice)}
                  expanded={!!expanded[room.id]}
                  onExpand={() => setExpanded((e: any) => {
                    // Force a brand-new object to guarantee React re-render
                    const next = { ...e };
                    const wasExpanded = !!next[room.id];
                    if (wasExpanded) delete next[room.id];
                    else next[room.id] = true;
                    return next;
                  })}
                  onToggleDevice={toggleDevice} onAdjustTemp={adjustTemp} onSlider={setSlider}
                  onOpenDetail={setDetailDevice}
                />
              ))}
            </div>
          </>
        )}

        {tab === "scenarios" && (
          <ScenariosTab scenarios={scenarios} onToggle={toggleScenario} onDelete={deleteScenario} onAdd={addScenario} />
        )}

        {tab === "energy" && <EnergyTab devices={devices.map(apiToDevice)} />}

        {tab === "manage" && (
          <ManageTab
            rooms={rooms} devices={devices}
            onAddRoom={() => setShowAddRoom(true)} onDeleteRoom={deleteRoom}
            onAddDeviceManually={() => openAddDevice(null)}
            onSaveParams={saveDeviceParams}
            onRemoveFromRoom={removeDeviceFromRoom}
            onDeleteDevice={deleteDevice}
            onAddDevice={addDeviceToRoom}
            discovering={discovering} discoveredDevices={discoveredDevices} secondsLeft={secondsLeft}
            onStartDiscovery={startDiscovery} onStopDiscovery={stopDiscovery}
            onAssignDiscovered={(d) => setAssigningDevice(d)} onDismissDiscovered={dismissDiscovered}
            aiConfig={aiConfig} onAiChange={aiChange}
            onTestConnection={testAiConnection} onDisconnectAi={disconnectAi} onToggleAiScenarios={toggleAiScenarios}
            voice={{
              enabled: voiceEnabled,
              onToggleEnabled: () => setVoiceEnabled((v) => !v),
              command: voiceCommand,
              onCommandChange: setVoiceCommand,
              onSubmitCommand: submitVoiceCommand,
              log: voiceLog,
              pendingActions,
              onConfirmAction: confirmPendingAction,
              onDismissAction: dismissPendingAction,
              suggestions,
              onAcceptSuggestion: acceptSuggestion,
              onDismissSuggestion: dismissSuggestion,
              briefing: dailyBriefing,
            }}
          />
        )}

        {/* bottom nav */}
        <div className="se-nav">
          <button className={"se-nav-btn" + (tab === "home" ? " se-nav-btn--active" : "")} onClick={() => setTab("home")}><Home size={18} strokeWidth={1.6} /><span>Дом</span></button>
          <button className={"se-nav-btn" + (tab === "scenarios" ? " se-nav-btn--active" : "")} onClick={() => setTab("scenarios")}><Workflow size={18} strokeWidth={1.6} /><span>Сценарии</span></button>
          <button className={"se-nav-btn" + (tab === "energy" ? " se-nav-btn--active" : "")} onClick={() => setTab("energy")}><Zap size={18} strokeWidth={1.6} /><span>Энергия</span></button>
          <button className={"se-nav-btn" + (tab === "manage" ? " se-nav-btn--active" : "")} onClick={() => setTab("manage")}><Settings size={18} strokeWidth={1.6} /><span>Управление</span></button>
        </div>
      </div>

      {showAddDevice && (
        <AddDeviceModal rooms={rooms.map((r: any) => ({ id: String(r.id), name: r.name }))}
          presetRoomId={presetRoomId ? String(presetRoomId) : null}
          onClose={() => setShowAddDevice(false)} onConfirm={confirmAddDevice} />
      )}
      {showAddRoom && <AddRoomModal onClose={() => setShowAddRoom(false)} onConfirm={confirmAddRoom} />}
      {assigningDevice && (
        <AssignDiscoveredModal device={assigningDevice} rooms={rooms}
          onClose={() => setAssigningDevice(null)} onConfirm={confirmAssignDiscovered} />
      )}
      {detailDevice && (
        <DeviceDetailSheet
          device={devices.map(apiToDevice).find((d: any) => d.id === detailDevice.id) || detailDevice}
          room={rooms.find((r: any) => r.id === detailDevice.roomId)}
          onClose={() => setDetailDevice(null)}
          onToggle={toggleDevice} onAdjustTemp={adjustTemp} onSlider={setSlider}
        />
      )}

      {/* Toast banner */}
      {toast && (
        <div className="se-toast">
          <CheckCircle2 size={16} strokeWidth={2} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

const css = `
* { box-sizing: border-box; }
.se-stage { min-height: 100vh; width: 100%; background: #0A0C0B; display: flex; justify-content: center; font-family: 'Inter', sans-serif; padding: 0; }
.se-app { width: 420px; max-width: 100%; min-height: 100vh; background: linear-gradient(180deg, #0D110E, #0A0C0B 40%); position: relative; padding-bottom: 78px; }

.se-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 22px 20px 14px; }
.se-logo { font-family: 'Cormorant SC', serif; font-size: 20px; letter-spacing: 0.08em; color: #E9E4D8; font-weight: 600; }
.se-logo-sub { font-size: 11px; color: #5A5F58; margin-top: 3px; font-family: 'JetBrains Mono', monospace; }
.se-mode-pill { display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.03); border: 1px solid rgba(201,162,75,0.18); border-radius: 20px; padding: 6px 12px; font-size: 11.5px; color: #C9A24B; font-family: 'JetBrains Mono', monospace; cursor: pointer; }
.se-mode-dot { width: 6px; height: 6px; border-radius: 50%; background: #5A5F58; }
.se-mode-dot--live { background: #5CC98A; box-shadow: 0 0 8px rgba(92,201,138,0.7); }

.se-status-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 0 20px 16px; }
.se-status-chip { display: flex; align-items: center; gap: 7px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 9px 8px; color: #B7BDB4; }
.se-status-chip--alert { border-color: rgba(217,105,95,0.35); background: rgba(217,105,95,0.06); color: #D9695F; }
.se-status-chip--ok { color: #7FE0A8; }
.se-status-chip--on { color: #E9C989; }
.se-status-val { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; line-height: 1.2; }
.se-status-label { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.03em; color: #5A5F58; margin-top: 1px; }

.se-section-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #7A7F79; display: flex; align-items: center; gap: 5px; margin: 4px 0 -2px; }
.se-fav-section { display: flex; flex-direction: column; gap: 8px; }
.se-running-section { display: flex; flex-direction: column; gap: 8px; }
.se-running-idle { font-size: 11.5px; color: #5A5F58; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 12px; }
.se-running-list { display: flex; flex-direction: column; gap: 6px; }
.se-running-row { display: flex; align-items: center; gap: 9px; background: rgba(95,201,138,0.06); border: 1px solid rgba(95,201,138,0.25); border-radius: 10px; padding: 9px 11px; }
.se-running-dot { width: 7px; height: 7px; border-radius: 50%; background: #5CC98A; box-shadow: 0 0 8px rgba(92,201,138,0.8); animation: pc-pulse-gold 1.6s ease-in-out infinite; flex-shrink: 0; }
@keyframes pc-pulse-gold { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
.se-running-text { font-size: 11.5px; color: #D8D3C6; line-height: 1.4; }

.se-glance-row { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 12px; margin-top: -6px; }
.se-glance-chip { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #8B9088; background: rgba(255,255,255,0.03); border-radius: 8px; padding: 3px 7px; font-family: 'JetBrains Mono', monospace; }
.se-glance-chip--alert { color: #D9695F; background: rgba(217,105,95,0.08); }
.se-glance-chip--ok { color: #7FE0A8; }
.se-glance-chip--on { color: #E9C989; }
.se-glance-chip--warn { color: #C9A24B; }

.se-text-link { display: block; width: 100%; text-align: center; background: none; border: none; color: #7A5C2E; font-size: 11px; margin-top: 14px; cursor: pointer; font-family: inherit; }
.se-text-link:hover { color: #C9A24B; }

.se-room { border-radius: 16px; background: linear-gradient(165deg, rgba(24,30,25,0.65), rgba(14,18,15,0.65)); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid rgba(201,162,75,0.14); overflow: hidden; }
.se-room-head { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: transparent; border: none; cursor: pointer; text-align: left; font-family: inherit; }
.se-room-head-left { display: flex; align-items: center; gap: 12px; }
.se-room-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(201,162,75,0.14); color: #C9A24B; }
.se-room-icon--live { box-shadow: 0 0 0 1px rgba(95,201,138,0.4), 0 0 14px rgba(95,201,138,0.15); color: #7FE0A8; }
.se-room-name { font-family: 'Cormorant SC', serif; font-size: 16.5px; color: #E9E4D8; font-weight: 600; }
.se-room-sub { font-size: 11px; color: #5A5F58; margin-top: 2px; font-family: 'JetBrains Mono', monospace; }
.se-room-head-right { display: flex; align-items: center; gap: 10px; }
.se-alert-pill { display: flex; align-items: center; gap: 4px; background: rgba(178,59,52,0.14); color: #D9695F; border: 1px solid rgba(178,59,52,0.3); border-radius: 20px; padding: 3px 8px; font-size: 10.5px; }

.se-room-body { max-height: 0; overflow: hidden; transition: max-height 380ms cubic-bezier(.4,0,.2,1); }
.se-room-body--open { max-height: 900px; }
.se-room-body-inner { padding: 0 14px 16px; border-top: 1px solid rgba(255,255,255,0.05); }
.se-empty { padding: 16px 4px; font-size: 12px; color: #5A5F58; }

.se-tile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.se-tile { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 10px 11px; cursor: pointer; transition: border-color 150ms ease, background 150ms ease; }
.se-tile:hover { border-color: rgba(201,162,75,0.3); background: rgba(255,255,255,0.04); }
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
.se-slider { -webkit-appearance: none; height: 3px; border-radius: 2px; background: linear-gradient(90deg,#C9A24B, rgba(255,255,255,0.08)); outline: none; }
.se-slider--sm { flex: 1; }
.se-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #C9A24B; border: 2px solid #0A0C0B; cursor: pointer; }

.se-climate-row { display: flex; align-items: center; gap: 8px; }
.se-temp-btn { width: 22px; height: 22px; border-radius: 6px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: #C9A24B; font-size: 14px; cursor: pointer; line-height: 1; }
.se-climate-temp { font-size: 13px; }

.se-switch { width: 30px; height: 17px; border-radius: 20px; background: rgba(255,255,255,0.08); position: relative; border: none; cursor: pointer; flex-shrink: 0; transition: background 200ms ease; }
.se-switch--on { background: #3E7A56; }
.se-switch-knob { position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: #E9E4D8; transition: transform 200ms ease; }
.se-switch--on .se-switch-knob { transform: translateX(13px); }

.se-add-here { display: flex; align-items: center; gap: 6px; width: 100%; margin-top: 12px; padding: 9px 0; background: transparent; border: 1px dashed rgba(201,162,75,0.25); border-radius: 10px; color: #7A5C2E; font-size: 11.5px; cursor: pointer; justify-content: center; font-family: inherit; }
.se-add-here:hover { color: #C9A24B; border-color: rgba(201,162,75,0.5); }
.se-bottom-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }

.se-outline-btn { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 12px 0; border-radius: 12px; background: rgba(201,162,75,0.06); border: 1px solid rgba(201,162,75,0.22); color: #C9A24B; font-size: 13px; cursor: pointer; font-family: inherit; width: 100%; }
.se-outline-btn:hover { background: rgba(201,162,75,0.11); }
.se-outline-btn--danger { color: #D9695F; border-color: rgba(217,105,95,0.3); background: rgba(217,105,95,0.06); margin-top: 8px; }
.se-outline-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.se-nav { position: absolute; bottom: 0; left: 0; right: 0; display: flex; background: rgba(10,12,11,0.9); backdrop-filter: blur(14px); border-top: 1px solid rgba(201,162,75,0.14); padding: 10px 6px 14px; }
.se-nav-btn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; background: transparent; border: none; color: #5A5F58; cursor: pointer; font-family: inherit; font-size: 9.5px; }
.se-nav-btn--active { color: #C9A24B; }

.se-scn-list { display: flex; flex-direction: column; gap: 7px; margin-bottom: 18px; }
.se-scn-row { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 11px; }
.se-scn-text { flex: 1; font-size: 12px; color: #B7BDB4; line-height: 1.4; }
.se-scn-if { color: #7A5C2E; font-size: 10px; letter-spacing: 0.05em; }
.se-scn-then { color: #C9A24B; }
.se-icon-btn { background: transparent; border: none; color: #5A5F58; cursor: pointer; display: flex; padding: 4px; }
.se-icon-btn--danger:hover { color: #D9695F; }
.se-icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.se-scn-add { display: flex; flex-direction: column; gap: 8px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.06); }

.se-energy-hero { text-align: center; padding: 18px 0 8px; }
.se-energy-hero-num { font-family: 'Cormorant SC', serif; font-size: 42px; color: #E9E4D8; line-height: 1; }
.se-energy-hero-unit { font-size: 11px; color: #5A5F58; margin-top: 4px; letter-spacing: 0.05em; text-transform: uppercase; }
.se-hist { display: flex; align-items: flex-end; height: 60px; gap: 2px; margin-top: 18px; }
.se-plug-list { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
.se-plug-row { display: flex; align-items: center; gap: 9px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 12px; }
.se-plug-name { flex: 1; font-size: 12.5px; color: #D8D3C6; }

.pc-hist-col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; }
.pc-hist-bar { width: 100%; border-radius: 2px 2px 0 0; min-height: 3px; }
.pc-hist-caption { margin-top: 8px; font-size: 10px; color: #5A5F58; text-align: right; }

/* manage tab */
.se-manage-section { padding: 16px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.se-manage-section--last { border-bottom: none; }
.se-manage-head { display: flex; align-items: center; gap: 6px; font-family: 'Cormorant SC', serif; font-size: 14.5px; letter-spacing: 0.04em; color: #E9E4D8; margin-bottom: 10px; }
.se-manage-caption { font-size: 11.5px; color: #5A5F58; line-height: 1.5; margin-bottom: 12px; }
.se-room-manage-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.se-room-manage-row { display: flex; align-items: center; gap: 9px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 9px 11px; }
.se-room-manage-name { flex: 1; font-size: 12.5px; color: #D8D3C6; }
.se-primary-btn--wide { width: 100%; }
.se-discovery-panel { background: rgba(201,162,75,0.05); border: 1px solid rgba(201,162,75,0.2); border-radius: 12px; padding: 14px; margin-bottom: 4px; }
.se-discovery-status { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: #E9C989; font-family: 'JetBrains Mono', monospace; margin-bottom: 10px; }
.se-discovery-dot { width: 7px; height: 7px; border-radius: 50%; background: #C9A24B; animation: pc-pulse-gold 1.6s ease-in-out infinite; }
.se-discovery-bar { height: 4px; border-radius: 2px; background: rgba(255,255,255,0.08); overflow: hidden; margin-bottom: 12px; }
.se-discovery-bar-fill { height: 100%; background: linear-gradient(90deg,#7A5C2E,#C9A24B); transition: width 1s linear; }
.se-found-list { display: flex; flex-direction: column; gap: 7px; margin-top: 12px; }
.se-found-item { display: flex; align-items: center; gap: 9px; background: rgba(95,201,138,0.05); border: 1px solid rgba(95,201,138,0.2); border-radius: 10px; padding: 9px 10px; }
.se-found-item-text { flex: 1; }
.se-found-type { font-size: 12px; color: #D8D3C6; }
.se-found-ieee { font-size: 9.5px; color: #5A5F58; font-family: 'JetBrains Mono', monospace; }
.se-mini-btn { background: #3E7A56; color: #E9F5EC; border: none; border-radius: 8px; padding: 6px 10px; font-size: 11px; cursor: pointer; font-family: inherit; }
.se-found-row { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 10px; margin-bottom: 14px; }
.se-provider-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 4px; }
.se-ai-connected-row { display: flex; align-items: center; gap: 7px; font-size: 13px; color: #D8D3C6; }
.se-ai-toggle-row { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; font-size: 12.5px; color: #B7BDB4; }
.se-ai-error { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #D9695F; margin: 6px 0 10px; }
.se-hermes-pipeline { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-bottom: 14px; }
.se-hermes-step { font-size: 10.5px; font-family: 'JetBrains Mono', monospace; color: #B7BDB4; background: rgba(201,162,75,0.08); border: 1px solid rgba(201,162,75,0.2); border-radius: 7px; padding: 4px 8px; }
.se-hermes-step--off { opacity: 0.35; }
.se-hermes-arrow { color: #5A5F58; font-size: 11px; }
.se-voice-test-row { display: flex; gap: 8px; }
.se-voice-test-row .se-input { margin-bottom: 0; }
.se-voice-log { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.se-voice-log-row { font-size: 11.5px; line-height: 1.4; padding: 8px 10px; border-radius: 9px; display: flex; gap: 6px; }
.se-voice-log-row--user { background: rgba(255,255,255,0.03); color: #D8D3C6; align-self: flex-end; }
.se-voice-log-row--system { background: rgba(95,201,138,0.06); color: #B8F0CE; border: 1px solid rgba(95,201,138,0.15); }
.se-voice-log-row--ai { background: rgba(201,162,75,0.06); color: #E9C989; border: 1px solid rgba(201,162,75,0.18); }
.se-pending-list { display: flex; flex-direction: column; gap: 7px; }
.se-pending-row { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 10px 11px; }
.se-pending-text { flex: 1; font-size: 11.5px; color: #D8D3C6; line-height: 1.4; }
.se-pending-btns { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.se-briefing { font-size: 12px; color: #B7BDB4; line-height: 1.6; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.08); border-radius: 10px; padding: 12px; }

/* modal */
.se-modal-overlay { position: fixed; inset: 0; background: rgba(5,6,5,0.72); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 12px; }
.se-modal { width: 420px; max-width: 100%; max-height: 90vh; overflow-y: auto; background: linear-gradient(165deg, #171C18, #0D110E); border: 1px solid rgba(201,162,75,0.2); border-radius: 20px; padding: 18px 20px 26px; }
.se-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.se-modal-title { font-family: 'Cormorant SC', serif; font-size: 17px; color: #E9E4D8; letter-spacing: 0.03em; }
.se-modal-sub { font-size: 11.5px; color: #5A5F58; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }

.se-type-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px; }
.se-type-btn { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 11px; padding: 11px 10px; color: #B7BDB4; font-size: 12px; cursor: pointer; text-align: left; font-family: inherit; }
.se-type-btn--active { border-color: rgba(201,162,75,0.5); background: rgba(201,162,75,0.08); color: #E9E4D8; }
.se-field-label { display: block; font-size: 10.5px; color: #7A7F79; text-transform: uppercase; letter-spacing: 0.04em; margin: 12px 0 6px; }
.se-input { width: 100%; padding: 11px 12px; border-radius: 10px; background: rgba(0,0,0,0.28); border: 1px solid rgba(255,255,255,0.08); color: #E9E4D8; font-size: 13px; font-family: inherit; margin-bottom: 4px; }
.se-input:focus { outline: none; border-color: rgba(201,162,75,0.5); }
.se-segmented--modal { display: flex; background: rgba(0,0,0,0.25); border-radius: 9px; padding: 3px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 8px; }
.pc-seg-btn { flex: 1; padding: 7px 0; font-size: 11.5px; font-family: inherit; color: #8B9088; background: transparent; border: none; border-radius: 7px; cursor: pointer; }
.pc-seg-btn--active { background: linear-gradient(165deg, rgba(201,162,75,0.20), rgba(201,162,75,0.06)); color: #E9C989; box-shadow: inset 0 0 0 1px rgba(201,162,75,0.30); }
.se-icon-picker { display: flex; gap: 8px; margin-top: 4px; }
.se-icon-pick { width: 38px; height: 38px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: #8B9088; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.se-icon-pick--active { border-color: rgba(201,162,75,0.5); color: #C9A24B; background: rgba(201,162,75,0.08); }
.se-primary-btn { width: 100%; margin-top: 16px; padding: 13px 0; display: flex; align-items: center; justify-content: center; gap: 7px; background: linear-gradient(165deg, #C9A24B, #9C7D38); border: none; border-radius: 12px; color: #17130A; font-weight: 600; font-size: 13.5px; cursor: pointer; font-family: inherit; }
.se-primary-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.se-discovering { display: flex; flex-direction: column; align-items: center; padding: 40px 0 24px; gap: 12px; }
.se-discovering-text { color: #D8D3C6; font-size: 13.5px; }
.se-discovering-sub { color: #5A5F58; font-size: 11px; font-family: 'JetBrains Mono', monospace; }
.se-spin { animation: se-rotate 1s linear infinite; }
@keyframes se-rotate { to { transform: rotate(360deg); } }

/* device detail sheet */
.se-detail-hero { display: flex; align-items: center; gap: 12px; padding: 6px 0 16px; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 14px; }
.se-detail-hero-icon { width: 44px; height: 44px; border-radius: 12px; background: rgba(201,162,75,0.08); border: 1px solid rgba(201,162,75,0.2); color: #C9A24B; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.se-detail-hero-type { font-family: 'Cormorant SC', serif; font-size: 15px; color: #E9E4D8; }
.se-detail-hero-room { font-size: 10.5px; color: #5A5F58; font-family: 'JetBrains Mono', monospace; margin-top: 2px; }
.se-detail-hero > div:nth-child(2) { flex: 1; }
.se-detail-control { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.se-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.se-detail-cell { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; padding: 10px 12px; }
.se-detail-cell .se-label { font-size: 10.5px; color: #7A7F79; text-transform: uppercase; letter-spacing: 0.04em; }
.se-value { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #E9E4D8; margin-top: 3px; }
.se-value--alert { color: #D9695F; }

.se-room-actions { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.se-room-actions .se-add-here { margin-top: 0; flex: 1; }
.se-delete-icon-btn { background: rgba(178,59,52,0.1); border: 1px solid rgba(178,59,52,0.25); color: #B23B34; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex-shrink: 0; }
.se-delete-icon-btn:hover { background: rgba(178,59,52,0.2); }
.se-empty-state { display: flex; flex-direction: column; align-items: center; padding: 32px 0 16px; gap: 8px; }
.se-empty-text { font-size: 13px; color: #8B9088; }
.se-empty-sub { font-size: 11px; color: #5A5F58; text-align: center; padding: 0 20px; line-height: 1.4; }

/* Toast banner */
.se-toast { position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; align-items: center; gap: 8px; background: rgba(16,20,18,0.95); border: 1px solid rgba(92,201,138,0.35); border-radius: 12px; padding: 12px 20px; font-size: 13px; color: #E9E4D8; backdrop-filter: blur(12px); box-shadow: 0 8px 32px rgba(0,0,0,0.6); animation: se-toast-in 0.3s ease-out; }
.se-toast svg { color: #5CC98A; flex-shrink: 0; }
@keyframes se-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

/* ── Zigbee Status Indicator ── */
.se-zigbee-indicator { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; padding: 6px 10px; cursor: pointer; color: inherit; font-family: inherit; font-size: 11px; position: relative; margin-right: 6px; }
.se-zigbee-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.se-zigbee-dot--on { background: #7FE0A8; box-shadow: 0 0 6px rgba(127,224,168,0.5); }
.se-zigbee-dot--off { background: #D9695F; }
.se-zigbee-pulse { position: absolute; left: 8px; width: 8px; height: 8px; border-radius: 50%; background: #C9A24B; animation: se-zbee-pulse 1.5s ease-in-out infinite; opacity: 0.6; pointer-events: none; }
@keyframes se-zbee-pulse { 0%,100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.9; transform: scale(2.2); } }
.se-zigbee-count { color: #B7BDB4; font-family: 'JetBrains Mono', monospace; font-size: 10px; }
.se-zigbee-popover { position: absolute; top: calc(100% + 8px); right: 0; background: #1F221E; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 14px; min-width: 200px; z-index: 100; }
.se-zigbee-popover-head { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #D8D3C6; margin-bottom: 10px; }
.se-zigbee-popover-row { display: flex; justify-content: space-between; align-items: center; font-size: 11px; padding: 5px 0; color: #B7BDB4; border-bottom: 1px solid rgba(255,255,255,0.04); }
.se-zigbee-popover-row:last-child { border-bottom: none; }
.se-zigbee-popover-val { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; }
.se-zigbee-popover-val--ok { color: #7FE0A8; }
.se-zigbee-popover-val--bad { color: #D9695F; }
`;
