import { useState, useEffect, useCallback, useRef } from 'react';
import { SmartCard } from '../components/ui/SmartCard';
import { SecurityCard } from '../components/ui/SecurityCard';
import { VoiceFAB } from '../components/ui/VoiceFAB';
import { VoiceFeedbackSheet } from '../components/ui/VoiceFeedbackSheet';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useLargeMode } from '../hooks/useLargeMode';
import { useMode } from '../hooks/useMode';
import { api } from '../api/client';
import { logClient } from '../lib/logger';
import type { DashboardData } from '../types';
import { Activity, FlaskConical } from 'lucide-react';

// ===== MOCK DATA (offline fallback) =====
const MOCK_DATA: DashboardData = {
  autoActive: true,
  nextEvent: 'Выключить свет в 22:30',
  security: { armed: true, openPoints: [] },
  rooms: [
    { id: '1', name: 'Гостиная', icon: '💡', temperature: 21.5, lightOn: true, status: 'auto' },
    { id: '2', name: 'Кухня', icon: '🌡️', temperature: 22, status: 'auto' },
    { id: '3', name: 'Спальня', icon: '🌙', temperature: 20, status: 'override', overrideUntil: '22:30' },
    { id: '4', name: 'Ванная', icon: '💡', lightOn: false, status: 'auto' },
  ],
  todayEnergy: 4.2,
  energyTrend: [1.2, 0.8, 0.6, 0.5, 0.7, 1.1, 2.0, 2.5, 2.8, 2.1, 1.7, 1.4, 1.6, 1.8, 2.0, 2.4, 2.6, 2.1, 1.5, 1.2, 1.0, 0.8, 0.7, 0.6],
};

const FALLBACK_TREND = [0.3, 0.2, 0.2, 0.1, 0.2, 0.5, 1.1, 1.8, 2.2, 2.4, 2.0, 1.6, 1.4, 1.5, 1.7, 2.1, 2.5, 2.3, 1.9, 1.3, 1.0, 0.7, 0.5, 0.4];

/**
 * Dashboard — главный экран.
 * Показывает статус автоматизации, охрану, сетку комнат, мини-график и FAB.
 */
export default function Dashboard() {
  const { large } = useLargeMode();
  const { mode, toggle: toggleMode, loading: modeLoading } = useMode();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [lastMessage, setLastMessage] = useState('');
  const voiceTimerRef = useRef(0);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setError(false);
    try {
      setData(await api.getDashboard());
      setLoading(false);
      return;
    } catch (error) {
      logClient('warn', 'Dashboard: API недоступен, включены mock-данные', error instanceof Error ? error.message : String(error));
    }
    // Fallback to mock (offline)
    setError(true);
    setData(MOCK_DATA);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  // Cleanup voice timer on unmount
  useEffect(() => {
    return () => {
      if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current);
    };
  }, []);

  // Reload data when mode changes
  useEffect(() => {
    if (mode === 'demo') {
      // Give demo time to seed
      const timer = window.setTimeout(() => {
        void loadData(true);
      }, 1500);
      return () => window.clearTimeout(timer);
    }
  }, [mode, loadData]);

  const handleVoiceTap = () => {
    if (!voiceOpen) {
      setVoiceOpen(true);
      setVoiceListening(true);
      // Simulate voice recognition
      voiceTimerRef.current = window.setTimeout(() => {
        setVoiceListening(false);
        setVoiceText('Включила свет в коридоре');
      }, 1500);
    }
  };

  const handleVoiceCancel = () => {
    setVoiceOpen(false);
    setVoiceText('');
  };

  const handleVoiceClose = async () => {
    const text = voiceText;
    setVoiceOpen(false);
    setVoiceText('');
    try {
      const result = await api.voiceCommand(text);
      setLastMessage(`✅ ${result.text || result.action || 'Готово'}`);
    } catch (error) {
      logClient('warn', 'Голосовая команда не выполнена', error instanceof Error ? error.message : String(error));
      setLastMessage('⚠️ Команда не отправлена');
    }
    window.setTimeout(() => setLastMessage(''), 3000);
  };

  const handleToggleRoom = (roomId: string) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        rooms: prev.rooms.map(r =>
          r.id === roomId ? {
            ...r,
            lightOn: !r.lightOn,
            status: r.status === 'auto' ? 'override' as const : r.status === 'error' ? 'override' as const : 'auto' as const
          } : r
        ),
      };
    });
    api.toggleLight(roomId).catch(error => {
      logClient('warn', 'Не удалось переключить комнату', error instanceof Error ? error.message : String(error));
    });
  };

  const handleOverride = (roomId: string, minutes: number) => {
    setData(prev => {
      if (!prev) return prev;
      let until: Date;
      if (minutes === 0) {
        // До утра (7:00)
        until = new Date();
        until.setDate(until.getDate() + 1);
        until.setHours(7, 0, 0, 0);
      } else {
        until = new Date(Date.now() + minutes * 60000);
      }
      return {
        ...prev,
        rooms: prev.rooms.map(r =>
          r.id === roomId ? { ...r, status: 'override' as const, overrideUntil: until.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : r
        ),
      };
    });
    api.overrideRoom(roomId, minutes).catch(error => {
      logClient('warn', 'Не удалось включить ручной режим', error instanceof Error ? error.message : String(error));
    });
  };

  if (loading) return <DashboardSkeleton />;
  if (!data) return null;

  return (
    <div className="p-4 pb-24 animate-fade-in">
      {/* ===== HEADER ===== */}
      <header className="flex items-center justify-between mb-4" style={{ minHeight: 64 }}>
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">🏠</span>
          <h1 className={`font-bold text-text ${large ? 'text-2xl' : 'text-lg'}`}>
            Умная Усадьба
          </h1>
        </div>
        <div className="flex items-center gap-1" aria-label="Кто дома">
          {['👨‍💼', '🧔‍♀️'].map((avatar, i) => (
            <span key={i} className="w-8 h-8 rounded-full bg-surface border-2 border-green
                                    flex items-center justify-center text-sm"
                  title={i === 0 ? 'Дмитрий' : 'Кристина'}>
              {avatar}
            </span>
          ))}
        </div>
      </header>

      {/* ===== MODE BADGE + OFFLINE BANNER ===== */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={toggleMode}
          disabled={modeLoading}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
                     tap-active transition-all min-h-[32px]
                     ${mode === 'demo'
                       ? 'bg-yellow/15 text-yellow border border-yellow/30'
                       : 'bg-green/10 text-green border border-green/20'}`}
          aria-label={`Режим: ${mode === 'demo' ? 'демо' : 'реальный'}`}
        >
          <FlaskConical size={14} />
          {mode === 'demo' ? 'DEMO' : 'LIVE'}
        </button>
        {mode === 'demo' && (
          <span className="text-[10px] text-text-dim">датчики симулируются</span>
        )}
        {error && (
          <span className="ml-auto text-xs text-yellow flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
            офлайн — mock-данные
          </span>
        )}
      </div>

      {/* ===== VOICE RESULT TOAST ===== */}
      {lastMessage && (
        <div className="mb-3 px-3 py-2 bg-surface rounded-card border border-blue/20 text-sm text-text animate-fade-in">
          {lastMessage}
        </div>
      )}

      {/* ===== AUTO STATUS CARD ===== */}
      <div className="bg-surface rounded-card p-4 mb-3 border border-auto/20" style={{ minHeight: 72 }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full bg-auto" aria-hidden="true" />
          <span className={`font-bold text-auto ${large ? 'text-xl' : 'text-base'}`}>
            Авто-режим активен
          </span>
        </div>
        <p className="text-sm text-text-dim ml-4">Следующее: {data.nextEvent}</p>
        <button className="mt-2 ml-4 text-sm text-blue font-medium hover:underline tap-active"
                aria-label="Изменить расписание">
          Изменить расписание
        </button>
      </div>

      {/* ===== SECURITY CARD ===== */}
      <div className="mb-3">
        <SecurityCard armed={data.security.armed} openPoints={data.security.openPoints} />
      </div>

      {/* ===== ROOMS GRID ===== */}
      <div className={`grid gap-3 mb-3 ${large ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {data.rooms.map(room => (
          <SmartCard
            key={room.id}
            name={room.name}
            icon={room.icon}
            value={room.temperature ? `${room.temperature}°` : room.lightOn ? 'Вкл' : 'Выкл'}
            status={room.status}
            overrideUntil={room.overrideUntil}
            onToggle={() => handleToggleRoom(room.id)}
            onOverride={(mins) => handleOverride(room.id, mins)}
            large={large}
          />
        ))}
      </div>

      {/* ===== MINI ENERGY CHART ===== */}
      <div className="bg-surface rounded-card p-4" style={{ minHeight: 140 }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-dim flex items-center gap-1.5">
            <Activity size={16} />
            Потребление за 24 ч
          </span>
          <span className="font-mono font-semibold text-text">
            {data.todayEnergy} кВт·ч
          </span>
        </div>
        {/* Chart frame — keeps bars inside bounds */}
        <div className="bg-bg rounded-card border border-surface-hover overflow-hidden" style={{ padding: 1 }}>
          <div className="flex items-end gap-px mx-0.5 my-2 h-16" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, i) => {
              const val = data.energyTrend[i] ?? FALLBACK_TREND[i] ?? 0;
              const maxVal = 3.2; // ceiling above max data point
              const clamped = Math.min(maxVal, Math.max(0, val));
              const height = Math.max(3, (clamped / maxVal) * 100);
              return (
                <div key={i} className="flex-1 bg-blue/30 rounded-sm"
                     style={{ height: `${height}%`, minHeight: 2 }}
                     title={`${i}:00 — ${val.toFixed(1)} кВт`} />
              );
            })}
          </div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-text-dim">00:00</span>
          <span className="text-[10px] text-text-dim">12:00</span>
          <span className="text-[10px] text-text-dim">Сейчас</span>
        </div>
      </div>

      {/* ===== VOICE FAB ===== */}
      <VoiceFAB listening={voiceListening} onClick={handleVoiceTap} />
      <VoiceFeedbackSheet
        open={voiceOpen}
        listening={voiceListening}
        text={voiceText}
        onCancel={handleVoiceCancel}
        onClose={handleVoiceClose}
      />
    </div>
  );
}
