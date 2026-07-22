import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';

/**
 * Хук PWA-обновлений. Показывает баннер при любом сценарии.
 */
export function usePwaUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const workerRef = useRef<ServiceWorker | null>(null);
  const controllerChanged = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const checkNow = async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;

      if (reg.waiting) {
        workerRef.current = reg.waiting;
        setUpdateAvailable(true);
        return;
      }

      const onUpdateFound = () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            workerRef.current = newWorker;
            setUpdateAvailable(true);
          }
        });
      };
      reg.addEventListener('updatefound', onUpdateFound);

      // ⚡ Каждые 10 секунд проверяем обновление через reg.waiting
      const pollInterval = setInterval(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        if (r?.waiting && r.waiting !== workerRef.current) {
          workerRef.current = r.waiting;
          setUpdateAvailable(true);
          clearInterval(pollInterval);
        }
      }, 10_000);

      // ⚡ Каждые 30 секунд принудительно проверяем SW через reg.update()
      // Это заставляет браузер скачивать /sw.js и сравнивать с текущим
      const updateInterval = setInterval(async () => {
        try {
          const r = await navigator.serviceWorker.getRegistration();
          if (r) {
            await r.update();
          }
        } catch {
          // игнорируем ошибки сети
        }
      }, 5_000);

      return () => {
        reg.removeEventListener('updatefound', onUpdateFound);
        clearInterval(pollInterval);
        clearInterval(updateInterval);
      };
    };

    checkNow();

    // Сбрасываем флаг при смене контроллера
    const onControllerChange = () => {
      controllerChanged.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(async () => {
    if (isApplying || controllerChanged.current) return;
    setIsApplying(true);

    // Виброотклик
    if (navigator.vibrate) navigator.vibrate(15);

    try {
      // ═══ 1. Чистим PWA-кеш ═══
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((name) => caches.delete(name))
      );

      // ═══ 2. Обновляем service worker ═══
      const r = await navigator.serviceWorker.getRegistration();
      if (r) {
        // Принудительно проверяем SW — браузер скачает /sw.js
        await r.update();

        // Ждём появления нового waiting
        if (r.waiting) {
          // Шлём SKIP_WAITING
          r.waiting.postMessage({ type: 'SKIP_WAITING' });

          // Ждём активации
          const activated = await new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => resolve(false), 5000);
            const onStateChange = () => {
              if (r.waiting?.state === 'activated') {
                clearTimeout(timeout);
                resolve(true);
              }
            };
            if (r.waiting?.state === 'activated') {
              clearTimeout(timeout);
              resolve(true);
              return;
            }
            if (r.waiting) {
              r.waiting.addEventListener('statechange', onStateChange);
            } else {
              clearTimeout(timeout);
              resolve(false);
            }
          });

          if (!activated) {
            window.location.reload();
          }
          // Если activated = true — controllerchange сам перезагрузит
        } else {
          // Нет waiting — возможно уже обновлён
          window.location.reload();
        }
      } else {
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, [isApplying]);

  return { updateAvailable, applyUpdate, isApplying };
}

/**
 * Баннер обновления PWA с тактильным откликом и статусом.
 */
export function UpdateBanner({
  visible,
  onUpdate,
  isApplying,
}: {
  visible: boolean;
  onUpdate: () => void;
  isApplying: boolean;
}) {
  if (!visible && !isApplying) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 9999,
        background: '#1A1B1A',
        border: '1px solid rgba(201, 162, 75, 0.25)',
        borderRadius: 14,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <RefreshCw
        size={20}
        strokeWidth={1.6}
        color="#C9A24B"
        style={{
          flexShrink: 0,
          animation: isApplying ? 'se-spin 0.8s linear infinite' : 'none',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#E9E4D8',
            fontFamily: "'Cormorant SC', serif",
          }}
        >
          {isApplying ? 'Обновление…' : 'Доступно обновление'}
        </div>
        <div style={{ fontSize: 11, color: '#7A7F79', marginTop: 2 }}>
          {isApplying
            ? 'Устанавливаем новую версию…'
            : 'Нажмите, чтобы применить новую версию'}
        </div>
      </div>
      {!isApplying && (
        <button
          onClick={() => {
            // Виброотклик
            if (navigator.vibrate) navigator.vibrate(15);
            onUpdate();
          }}
          style={{
            background: '#3B9F6E',
            border: 'none',
            borderRadius: 12,
            padding: '14px 22px',
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
            fontFamily: "'Cormorant SC', serif",
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
            transition: 'transform 0.1s ease, background 0.15s ease, box-shadow 0.15s ease',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            letterSpacing: '0.04em',
            boxShadow: '0 2px 8px rgba(59, 159, 110, 0.35)',
          }}
          className="se-update-btn"
        >
          Обновить
        </button>
      )}
      {isApplying && (
        <Loader2
          size={22}
          strokeWidth={2}
          color="#3B9F6E"
          style={{
            flexShrink: 0,
            animation: 'se-spin 0.8s linear infinite',
          }}
        />
      )}
    </div>
  );
}
