import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, Wifi, WifiOff, Database, Activity,
  Download, ArrowRight, Shield, Mic, Zap, Check
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Страница установки и приветствия.
 * Доступна по /start.
 * — Если PWA уже установлено (standalone) → сразу на дашборд
 * — Если в браузере → показывает статус, предлагает установить
 */
export default function Welcome() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [mode, setMode] = useState<string>('—');
  const [devices, setDevices] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches);
  const [showInstall, setShowInstall] = useState(true);

  // Auto-redirect if already installed as PWA
  useEffect(() => {
    if (installed) {
      navigate('/', { replace: true });
    }
  }, [installed, navigate]);

  // Listen for install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    // Also detect if installed via appinstalled event
    const onInstalled = () => { setInstalled(true); navigate('/', { replace: true }); };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [navigate]);

  // Check backend status
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const { signal } = controller;

    const check = async () => {
      try {
        const res = await fetch('/api/status', { signal });
        if (res.ok) {
          const d = await res.json();
          if (d.ok && mounted) {
            setStatus('online');
            setDevices(d.devices?.total || 0);
          }
        }
        const modeRes = await fetch('/api/mode', { signal });
        if (modeRes.ok) {
          const m = await modeRes.json();
          if (mounted) setMode(m.mode || '—');
        }
      } catch (err) {
        if (!signal.aborted && mounted) setStatus('offline');
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
      controller.abort();
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="app-shell min-h-screen bg-bg text-text p-6 flex flex-col items-center justify-center">
      {/* Header */}
      <div className="text-center mb-8">
        <Home size={64} className="text-blue mx-auto mb-4" />
        <h1 className="text-2xl font-extrabold text-text mb-1">Умная Усадьба</h1>
        <p className="text-text-dim text-sm">Автономный умный дом</p>
      </div>

      {/* Status Cards */}
      <div className="w-full space-y-3 mb-6">
        {/* Backend Status */}
        <div className={`rounded-card p-4 flex items-center gap-3
                        ${status === 'online' ? 'bg-green/10 border border-green/20' :
                          status === 'offline' ? 'bg-red/10 border border-red/20' :
                          'bg-surface border border-surface-hover'}`}>
          {status === 'online' ? <Wifi size={22} className="text-green" /> :
           status === 'offline' ? <WifiOff size={22} className="text-red" /> :
           <Activity size={22} className="text-text-dim animate-pulse" />}
          <div className="flex-1">
            <div className="text-sm font-semibold">
              {status === 'online' ? 'Сервер подключён' :
               status === 'offline' ? 'Сервер недоступен' :
               'Проверка подключения...'}
            </div>
            <div className="text-xs text-text-dim">
              {status === 'online' ? `Устройств: ${devices} · Режим: ${mode}` :
               status === 'offline' ? 'Работаем офлайн — mock-данные' :
               'Подключаемся к Raspberry Pi...'}
            </div>
          </div>
          {status === 'online' && <Check size={18} className="text-green" />}
        </div>

        {/* PWA Install */}
        {!installed && (
          <button
            onClick={handleInstall}
            className="w-full rounded-card p-4 bg-blue/10 border border-blue/30
                       flex items-center gap-3 tap-active hover:bg-blue/20 transition-all"
          >
            <Download size={22} className="text-blue" />
            <div className="flex-1 text-left">
              <div className="text-sm font-semibold text-blue">Установить приложение</div>
              <div className="text-xs text-blue/70">На главный экран телефона</div>
            </div>
            <ArrowRight size={18} className="text-blue" />
          </button>
        )}

        {installed && (
          <div className="rounded-card p-4 bg-green/5 border border-green/20
                          flex items-center gap-3">
            <Check size={22} className="text-green" />
            <div>
              <div className="text-sm font-semibold text-green">Приложение установлено</div>
              <div className="text-xs text-text-dim">Работает как нативное</div>
            </div>
          </div>
        )}
      </div>

      {/* Features */}
      <div className="w-full grid grid-cols-2 gap-2 mb-6">
        {[
          { icon: Zap, label: 'Автоматика', desc: '70-80% сценариев' },
          { icon: Mic, label: 'Голос', desc: 'FAB на всех экранах' },
          { icon: Shield, label: 'Охрана', desc: 'Двери, окна, датчики' },
          { icon: Database, label: 'Офлайн', desc: 'Всё локально' },
        ].map(f => (
          <div key={f.label} className="bg-surface rounded-card p-3 flex flex-col items-center gap-1 text-center">
            <f.icon size={20} className="text-text-dim" />
            <span className="text-xs font-semibold text-text">{f.label}</span>
            <span className="text-[10px] text-text-dim">{f.desc}</span>
          </div>
        ))}
      </div>

      {/* Enter App Button */}
      <button
        onClick={() => navigate('/')}
        className="w-full py-4 rounded-fab bg-auto text-bg font-bold text-lg
                   tap-active shadow-lg shadow-auto/20 transition-all hover:brightness-110
                   flex items-center justify-center gap-2 min-h-[56px]"
      >
        <Home size={22} />
        Открыть дашборд
      </button>

      <p className="text-[10px] text-text-dim text-center mt-4">
        Dev: Mac Mini · Prod: Raspberry Pi 5 · v1.0
      </p>
    </div>
  );
}
