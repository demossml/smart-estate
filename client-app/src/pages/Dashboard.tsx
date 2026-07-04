import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { VoiceFAB } from '../components/ui/VoiceFAB';
import { VoiceActivityBar } from '../components/ui/VoiceActivityBar';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { RoomTileV2 } from '../components/ui/RoomTileV2';
import { RoomAddModal } from '../components/ui/RoomAddModal';
import { useLargeMode } from '../hooks/useLargeMode';
import { useMode } from '../hooks/useMode';
import { useEstateSocket } from '../hooks/useEstateSocket';
import { api } from '../api/client';
import { logClient } from '../lib/logger';
import { Home, User, CheckCircle2, AlertTriangle, Activity, FlaskConical, Plus, Radar, Wifi, Shield, ChevronRight } from 'lucide-react';
import type { DashboardData, Device } from '../types';

// ===== MOCK DATA (offline fallback) =====
const MOCK_DATA: DashboardData = {
  autoActive: true,
  nextEvent: 'Выключить свет в 22:30',
  security: { armed: true, openPoints: [] },
  rooms: [
    { id: '1', name: 'Гостиная', icon: 'armchair', temperature: 21.5, lightOn: true, status: 'auto' },
    { id: '2', name: 'Кухня', icon: 'cooking-pot', temperature: 22, status: 'auto' },
    { id: '3', name: 'Спальня', icon: 'bed', temperature: 20, status: 'override', overrideUntil: '22:30' },
    { id: '4', name: 'Ванная', icon: 'bath', lightOn: false, status: 'auto' },
  ],
  todayEnergy: 4.2,
  energyTrend: [1.2, 0.8, 0.6, 0.5, 0.7, 1.1, 2.0, 2.5, 2.8, 2.1, 1.7, 1.4, 1.6, 1.8, 2.0, 2.4, 2.6, 2.1, 1.5, 1.2, 1.0, 0.8, 0.7, 0.6],
};

const FALLBACK_TREND = [0.3, 0.2, 0.2, 0.1, 0.2, 0.5, 1.1, 1.8, 2.2, 2.4, 2.0, 1.6, 1.4, 1.5, 1.7, 2.1, 2.5, 2.3, 1.9, 1.3, 1.0, 0.7, 0.5, 0.4];

export default function Dashboard() {
  const navigate = useNavigate();
  const { large } = useLargeMode();
  const { mode, toggle: toggleMode, loading: modeLoading } = useMode();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [lastMessage, setLastMessage] = useState('');
  const [lastMsgType, setLastMsgType] = useState<'ok' | 'warn'>('ok');
  const voiceTimerRef = useRef(0);

  // V2 dashboard data
  const [dashboardV2, setDashboardV2] = useState<any>(null);
  const [v2Error, setV2Error] = useState(false);
  const [v2Loading, setV2Loading] = useState(true);

  // Room management
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [editDevice, setEditDevice] = useState<Device | null>(null);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setV2Loading(true);
    setV2Error(false);
    try {
      setDashboardV2(await api.getDashboardV2());
      setV2Loading(false);
      return;
    } catch (e) {
      logClient('warn', 'Dashboard V2: API недоступен', e instanceof Error ? e.message : String(e));
    }
    setV2Error(true);
    setV2Loading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(true), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  // Legacy data for voice/override features (fallback via MOCK_DATA if v2 fails)
  // Legacy data for voice/override features (fallback via MOCK_DATA if v2 fails)
  const _data: DashboardData | null = v2Error ? MOCK_DATA : null;

  // Reload data when tab becomes visible again (e.g. returning from /devices)
  useEffect(() => {
    const onFocus = () => { void loadData(false); };
    const onRoomCreated = () => { void loadData(false); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('room-created', onRoomCreated);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('room-created', onRoomCreated);
    };
  }, [loadData]);

  const recognitionRef = useRef<any>(null);

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
    };
  }, []);

  const getRecognition = (): any => {
    if (recognitionRef.current) return recognitionRef.current;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    const r = new SpeechRecognition();
    r.lang = 'ru-RU';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = false;
    r.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.trim();
      setVoiceText(transcript);
      setVoiceListening(false);
    };
    r.onerror = (event: any) => {
      logClient('warn', 'Распознавание речи', event.error);
      setVoiceText('');
      setVoiceListening(false);
      setVoiceOpen(false);
      setLastMessage(event.error === 'not-allowed' ? 'Нет доступа к микрофону' : 'Не расслышал, попробуй ещё');
      setLastMsgType('warn');
      window.setTimeout(() => setLastMessage(''), 3000);
    };
    r.onend = () => {
      setVoiceListening(false);
    };
    recognitionRef.current = r;
    return r;
  };

  useEffect(() => {
    if (mode === 'demo') {
      const timer = window.setTimeout(() => void loadData(true), 1500);
      return () => window.clearTimeout(timer);
    }
  }, [mode, loadData]);

  const handleVoiceTap = () => {
    if (!voiceOpen) {
      const r = getRecognition();
      if (!r) {
        setLastMessage('Браузер не поддерживает распознавание речи');
        setLastMsgType('warn');
        window.setTimeout(() => setLastMessage(''), 3000);
        return;
      }
      setVoiceOpen(true);
      setVoiceListening(true);
      setVoiceText('');
      try {
        r.start();
        voiceTimerRef.current = window.setTimeout(() => {
          try { r.stop(); } catch {}
        }, 5000);
      } catch (e) {
        logClient('warn', 'Speech start error', e instanceof Error ? e.message : String(e));
        setVoiceListening(false);
        setVoiceOpen(false);
      }
    }
  };

  const handleVoiceCancel = () => {
    try { recognitionRef.current?.abort(); } catch {}
    setVoiceOpen(false); setVoiceText('');
  };
  const handleVoiceClose = async () => {
    const text = voiceText;
    setVoiceOpen(false); setVoiceText('');
    try {
      const result = await api.voiceCommand(text);
      setLastMessage(result.action || 'Готово');
      setLastMsgType('ok');
    } catch (e) {
      logClient('warn', 'Голосовая команда не выполнена', e instanceof Error ? e.message : String(e));
      setLastMessage('Команда не отправлена');
      setLastMsgType('warn');
    }
    window.setTimeout(() => setLastMessage(''), 3000);
  };

  const handleCreateRoom = async (name: string, iconKey: string) => {
    await api.createRoom(name, iconKey);
    setShowAddRoom(false);
    await loadData(true);
  };

  // ── Live telemetry via WebSocket — быстрый буфер ──────
  // Все MQTT сообщения накапливаются и сбрасываются одним setState через rAF.
  // Так датчик не спамит React ререндерами при пачке сообщений в 1 секунду.
  const telemetryBufferRef = useRef<Map<string, Record<string, any>>>(new Map());
  const flushRafRef = useRef<number>(0);

  // Force update counter for live telemetry
  const [telemetryTick, setTelemetryTick] = useState(0);

  const flushTelemetry = useCallback(() => {
    flushRafRef.current = 0;
    const buf = telemetryBufferRef.current;
    if (buf.size === 0) return;
    telemetryBufferRef.current = new Map();

    setDashboardV2((prev: any) => {
      if (!prev) return prev;

      // Применяем все накопленные сообщения из буфера
      let rooms = [...prev.rooms];
      for (const [friendlyName, payload] of buf.entries()) {
        const roomIdx = rooms.findIndex((r: any) =>
          r.devices.some((d: any) => d.friendly_name === friendlyName)
        );
        if (roomIdx === -1) continue;

        const room = { ...rooms[roomIdx] };
        const devices = room.devices.map((d: any) => {
          if (d.friendly_name !== friendlyName) return d;
          const telMap: Record<string, number> = {};
          for (const [prop, val] of Object.entries(payload)) {
            if (typeof val === 'number' || typeof val === 'string') {
              const numeric = typeof val === 'string'
                ? (['ON', 'open', 'present', 'leak'].includes(val) ? 1 : 0)
                : val;
              telMap[prop] = numeric;
            }
          }
          const latest = (d.latest_telemetry || []).map((t: any) => {
            if (telMap[t.property] !== undefined) {
              return { ...t, value: telMap[t.property] };
            }
            return t;
          });
          for (const [prop, val] of Object.entries(telMap)) {
            if (!latest.some((t: any) => t.property === prop)) {
              latest.push({ property: prop, value: val, unit: '' });
            }
          }
          return { ...d, latest_telemetry: latest };
        });
        room.devices = devices;

        // Обновляем temperature
        if (payload.temperature !== undefined) {
          room.temperature = payload.temperature;
        }

        // Обновляем air_quality
        const airProps = ['temperature', 'humidity', 'co2', 'voc', 'formaldehyde'];
        if (room.air_quality && airProps.some(p => payload[p] !== undefined)) {
          const aq = { ...room.air_quality };
          aq.params = aq.params.map((p: any) => {
            if (payload[p.property] !== undefined) return { ...p, value: payload[p.property] };
            return p;
          });
          const order: Record<string, number> = { good: 0, warn: 1, danger: 2 };
          let worst: string = 'good';
          aq.params = aq.params.map((p: any) => {
            const val = p.value;
            let status = 'good';
            if (p.property === 'temperature') {
              if (val > 28 || val < 10) status = 'danger';
              else if (val > 24 || val < 18) status = 'warn';
            } else if (p.property === 'humidity') {
              if (val > 70 || val < 20) status = 'danger';
              else if (val > 60 || val < 30) status = 'warn';
            } else {
              const warnMap: Record<string, number> = { co2: 2000, voc: 220, formaldehyde: 0.05 };
              const goodMap: Record<string, number> = { co2: 1000, voc: 65, formaldehyde: 0.01 };
              if (val > (warnMap[p.property] ?? Infinity)) status = 'danger';
              else if (val > (goodMap[p.property] ?? Infinity)) status = 'warn';
              else status = 'good';
            }
            if (order[status] > order[worst]) worst = status;
            return { ...p, status };
          });
          aq.overall = worst;
          room.air_quality = aq;
        }

        // Обновляем open_windows
        // contact: 1 = разомкнут = ОТКРЫТО, 0 = замкнут = ЗАКРЫТО
        const openWindows: { ieee_addr: string; friendly_name: string }[] = [];
        for (const d of devices) {
          const ct = d.latest_telemetry?.find((t: any) => t.property === 'contact');
          if (ct && ct.value === 1) {
            openWindows.push({ ieee_addr: d.ieee_addr, friendly_name: d.friendly_name });
          }
        }
        room.open_windows = openWindows;
        room.has_open_windows = openWindows.length > 0;

        rooms[roomIdx] = room;
      }

      // Пересчитываем security.openPoints по всем комнатам
      const openPoints: string[] = [];
      for (const r of rooms) {
        for (const w of (r.open_windows || [])) {
          openPoints.push(w.friendly_name);
        }
      }

      return {
        ...prev,
        rooms,
        security: { ...prev.security, openPoints },
      };
    });
    // Форсируем ререндер RoomTileV2
    setTelemetryTick(t => t + 1);
  }, []);

  const patchLiveTelemetry = useCallback((topic: string, payload: Record<string, any>) => {
    const friendlyName = topic.split('/')[1];
    if (!friendlyName) return;

    // Логируем на клиенте получение
    console.log('[WS]', friendlyName, JSON.stringify(payload));

    // Кладём в буфер — перезаписываем последнее значение для этого устройства
    telemetryBufferRef.current.set(friendlyName, payload);

    // Если пришёл contact — немедленно обновляем без ожидания rAF
    if ('contact' in payload) {
      if (flushRafRef.current) {
        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = 0;
      }
      flushTelemetry();
      return;
    }

    // Планируем сброс на следующий кадр анимации (схлопывает пачки сообщений)
    if (!flushRafRef.current) {
      flushRafRef.current = requestAnimationFrame(() => flushTelemetry());
    }
  }, [flushTelemetry]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (flushRafRef.current) cancelAnimationFrame(flushRafRef.current);
    };
  }, []);

  // Подключаем WebSocket с колбэком
  useEstateSocket(patchLiveTelemetry);

  if (v2Loading) return <DashboardSkeleton />;

  // ── ONBOARDING: LIVE + no rooms + no error ──────────────
  const showOnboarding = mode === 'live' && !v2Error && dashboardV2 && dashboardV2.rooms.length === 0;

  const MsgIcon = lastMsgType === 'ok' ? CheckCircle2 : AlertTriangle;
  const msgColor = lastMsgType === 'ok' ? 'text-green' : 'text-yellow';

  // Use v2 data
  const v2 = dashboardV2;
  const metrics = v2?.metrics || {};
  const energyToday = v2?.energy_today || 0;
  const v2Rooms = v2?.rooms || [];
  const isOffline = v2Error;

  // Security data from V2
  const sec = v2?.security;
  const anyOpen = sec?.openPoints?.length > 0;
  const openCount = sec?.openPoints?.length || 0;

  if (showOnboarding) {
    return (
      <div className="p-4 pb-24 animate-fade-in flex flex-col items-center justify-center min-h-[80vh]">
        {/* Header */}
        <header className="w-full flex items-center justify-between mb-8" style={{ minHeight: 64 }}>
          <div className="flex items-center gap-2.5">
            <Home size={24} className="text-blue" />
            <h1 className={`font-bold text-text ${large ? 'text-2xl' : 'text-xl'} tracking-tight`}>
              Умная Усадьба
            </h1>
          </div>
          <div className="flex items-center gap-1">
            {['Дмитрий', 'Кристина'].map((name, i) => (
              <div key={i}
                   className={`w-8 h-8 rounded-full ${i === 0 ? 'bg-blue' : 'bg-green'} flex items-center justify-center`}
                   title={name}>
                <User size={16} className="text-bg" />
              </div>
            ))}
          </div>
        </header>

        {/* Mode indicator */}
        <div className="flex items-center gap-2 mb-8 self-start">
          <button
            onClick={toggleMode} disabled={modeLoading}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tap-active transition-all min-h-[32px]
              bg-green/10 text-green border border-green/20`}
            aria-label="Режим: реальный"
          >
            <FlaskConical size={14} />
            LIVE
          </button>
        </div>

        {/* Onboarding hero */}
        <div className="flex flex-col items-center text-center max-w-sm">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue/20 to-green/20 flex items-center justify-center mb-6">
            <Wifi size={48} className="text-green" />
          </div>

          <h2 className={`font-extrabold text-text mb-2 ${large ? 'text-2xl' : 'text-xl'}`}>
            Добро пожаловать!
          </h2>
          <p className="text-text-dim text-sm mb-8 leading-relaxed">
            Система работает в <strong className="text-green">LIVE</strong> режиме.
            Давайте добавим ваше первое Zigbee-устройство.
          </p>

          {/* Steps */}
          <div className="w-full space-y-3 mb-8 text-left">
            {[
              { step: '1', icon: Radar, label: 'Найти устройство', desc: 'Нажмите сканер в разделе Устройства' },
              { step: '2', icon: Home, label: 'Назначьте комнату', desc: 'Дайте имя и выберите комнату' },
              { step: '3', icon: Activity, label: 'Всё готово', desc: 'Устройство появится на дашборде и начнёт передавать данные' },
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-3 bg-surface rounded-card p-4 border border-surface-hover">
                <div className="w-8 h-8 rounded-full bg-blue/15 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-blue">{s.step}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text flex items-center gap-1.5">
                    <s.icon size={14} className="text-text-dim" /> {s.label}
                  </div>
                  <div className="text-xs text-text-dim mt-0.5">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={() => navigate('/devices')}
            className="w-full py-4 rounded-fab bg-blue text-white font-bold text-lg
                       tap-active shadow-lg shadow-blue/20 transition-all hover:brightness-110
                       flex items-center justify-center gap-2 min-h-[56px]"
          >
            <Radar size={22} />
            Перейти к поиску устройств
          </button>
        </div>

        {lastMessage && (
          <div className="mt-4 px-3 py-2 bg-surface rounded-card border border-blue/20 text-sm text-text animate-fade-in flex items-center gap-2">
            <MsgIcon size={16} className={msgColor} /> {lastMessage}
          </div>
        )}

        <VoiceFAB listening={voiceListening} onClick={handleVoiceTap} />
        <VoiceActivityBar open={voiceOpen} listening={voiceListening} text={voiceText}
                            onCancel={handleVoiceCancel} onClose={handleVoiceClose} />
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 animate-fade-in">
      {/* ===== HEADER ===== */}
      <header className="flex items-center justify-between mb-4" style={{ minHeight: 64 }}>
        <div className="flex items-center gap-2.5">
          <Home size={24} className="text-blue" />
          <h1 className={`font-bold text-text ${large ? 'text-2xl' : 'text-xl'} tracking-tight`}>
            Умная Усадьба
          </h1>
        </div>
        <div className="flex items-center gap-1">
          {[
            { name: 'Дмитрий', color: 'bg-blue' },
            { name: 'Кристина', color: 'bg-green' },
          ].map((u, i) => (
            <div key={i}
                 className={`w-8 h-8 rounded-full ${u.color} flex items-center justify-center`}
                 title={u.name}>
              <User size={16} className="text-bg" />
            </div>
          ))}
        </div>
      </header>

      {/* ===== MODE + OFFLINE ===== */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={toggleMode} disabled={modeLoading}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tap-active transition-all min-h-[32px]
            ${mode === 'demo' ? 'bg-yellow/15 text-yellow border border-yellow/30' : 'bg-green/10 text-green border border-green/20'}`}
          aria-label={`Режим: ${mode === 'demo' ? 'демо' : 'реальный'}`}
        >
          <FlaskConical size={14} />
          {mode === 'demo' ? 'DEMO' : 'LIVE'}
        </button>
        {mode === 'demo' && <span className="text-[10px] text-text-dim">датчики симулируются</span>}
        {isOffline && (
          <span className="ml-auto text-xs text-yellow flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow" /> офлайн — заглушка
          </span>
        )}
      </div>

      {/* ===== VOICE TOAST ===== */}
      {/* Voice toast — iOS notification style */}
      {lastMessage && (
        <div className="mb-3 px-4 py-3 bg-surface rounded-card text-sm text-text animate-fade-in flex items-center gap-2.5">
          <MsgIcon size={16} className={msgColor} /> <span>{lastMessage}</span>
        </div>
      )}

      {/* ===== SECURITY — iOS style compact tile ===== */}
      <div className="mb-3">
        <button
          onClick={() => navigate('/gates')}
          className="w-full bg-surface rounded-card px-4 py-3.5 flex items-center gap-3 tap-active text-left min-h-[56px]"
        >
          <div className="relative shrink-0">
            <Shield size={20} className={`shrink-0 ${anyOpen ? 'text-red' : 'text-green'}`} />
            {anyOpen && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red rounded-full" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-text tracking-tight">Безопасность</div>
            <div className={`text-xs mt-0.5 ${anyOpen ? 'text-red' : 'text-green'}`}>
              {anyOpen
                ? `${openCount} открыт${openCount === 1 ? 'ая' : 'ых'}: ${sec.openPoints.slice(0, 3).join(', ')}${openCount > 3 ? ` и ещё ${openCount - 3}` : ''}`
                : 'Всё закрыто'}
            </div>
          </div>
          <ChevronRight size={16} className="text-text-dim shrink-0" />
        </button>
      </div>

      {/* ===== ROOMS ===== */}
      <div className="flex flex-col gap-2 mb-3">
        {v2Rooms.length > 0 ? v2Rooms.map((room: any) => (
          <RoomTileV2 key={room.id} room={room} telemetryTick={telemetryTick} />
        )) : (
          <div className="text-sm text-text-dim text-center py-8">
            {isOffline ? 'Данные недоступны (офлайн)' : 'Нет комнат. Добавьте первую.'}
          </div>
        )}

        {/* Add room button — iOS style */}
        <button
          onClick={() => setShowAddRoom(true)}
          className="w-full py-4 rounded-card bg-surface
                     text-text-dim font-medium text-sm flex items-center justify-center gap-2
                     tap-active min-h-[52px] active:text-blue active:bg-blue/5 transition-colors"
        >
          <Plus size={18} strokeWidth={2.5} /> Добавить комнату
        </button>
      </div>

      {/* ===== ENERGY CHART — iOS Style ===== */}
      <div className="bg-surface rounded-card p-4" style={{ minHeight: 120 }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-text-dim tracking-wide flex items-center gap-1.5 uppercase">
            <Activity size={14} /> Потребление
          </span>
          <span className="font-mono font-semibold text-[15px] text-text">{energyToday} кВт·ч</span>
        </div>
        <div className="bg-black/30 rounded-xl overflow-hidden" style={{ padding: 2 }}>
          <div className="flex items-end gap-[2px] mx-0.5 my-2.5 h-14" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, i) => {
              const val = FALLBACK_TREND[i] ?? 0;
              const height = Math.max(3, (val / 3.2) * 100);
              return <div key={i} className="flex-1 bg-blue/40 rounded-sm" style={{ height: `${height}%`, minHeight: 2 }} title={`${i}:00 — ${val.toFixed(1)} кВт`} />;
            })}
          </div>
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[9px] text-text-dim">00:00</span>
          <span className="text-[9px] text-text-dim">12:00</span>
          <span className="text-[9px] text-text-dim font-semibold text-text-secondary">Сейчас</span>
        </div>
      </div>

      {/* ===== MODALS ===== */}
      {showAddRoom && (
        <RoomAddModal onClose={() => setShowAddRoom(false)} onCreate={handleCreateRoom} />
      )}

      {/* ===== VOICE FAB ===== */}
      <VoiceFAB listening={voiceListening} onClick={handleVoiceTap} />
      <VoiceActivityBar open={voiceOpen} listening={voiceListening} text={voiceText}
                          onCancel={handleVoiceCancel} onClose={handleVoiceClose} />
    </div>
  );
}
