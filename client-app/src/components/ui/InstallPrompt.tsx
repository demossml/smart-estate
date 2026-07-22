import { useState, useEffect } from 'react';
import { Download, Check } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Маленькая кнопка «Установить» в шапке.
 * Показывается только в браузере, когда PWA не установлено.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);
  const [installed, setInstalled] = useState(false);

  // Already in standalone mode → nothing to show
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  useEffect(() => {
    if (isStandalone) {
      setHidden(true);
      return;
    }
    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    // Detect successful install
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [isStandalone]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  // Nothing to show
  if (hidden || isStandalone || installed) return null;

  // No prompt available yet, but we can show a small hint
  if (!deferredPrompt) return null;

  return (
    <button
      onClick={handleInstall}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
                 bg-blue/15 text-blue border border-blue/25 hover:bg-blue/25
                 tap-active transition-all min-h-[30px]"
      aria-label="Установить приложение"
    >
      <Download size={12} />
      <span className="hidden sm:inline">Установить</span>
    </button>
  );
}
