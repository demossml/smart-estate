import { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Хук, который слушает обновления service worker'а и показывает баннер.
 * При нажатии "Обновить" — активирует новый SW и перезагружает страницу.
 */
export function usePwaUpdate() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handler = (reg: ServiceWorkerRegistration) => {
      // Если есть ожидающий worker — обновление готово
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setUpdateAvailable(true);
      }
    };

    // При каждом изменении регистрации — проверяем
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg) {
        handler(reg);
        // Слушаем новые обновления
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setWaitingWorker(newWorker);
                setUpdateAvailable(true);
              }
            });
          }
        });
      }
    });
  }, []);

  const applyUpdate = useCallback(() => {
    if (waitingWorker) {
      // Отправляем сигнал новому SW — перехватить управление
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      // После смены control — перезагружаем страницу
      waitingWorker.addEventListener('statechange', () => {
        if (waitingWorker.state === 'activated') {
          window.location.reload();
        }
      });
    }
  }, [waitingWorker]);

  return { updateAvailable, applyUpdate };
}

/**
 * Баннер обновления. Вставить в корневой компонент.
 * Пропадает сам после обновления.
 */
export function UpdateBanner({ visible, onUpdate }: { visible: boolean; onUpdate: () => void }) {
  if (!visible) return null;

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
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <RefreshCw size={18} strokeWidth={1.6} color="#C9A24B" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#E9E4D8',
            fontFamily: "'Cormorant SC', serif",
          }}
        >
          Доступно обновление
        </div>
        <div style={{ fontSize: 11, color: '#7A7F79', marginTop: 1 }}>
          Новая версия приложения. Нажмите, чтобы применить.
        </div>
      </div>
      <button
        onClick={onUpdate}
        style={{
          background: '#3B9F6E',
          border: 'none',
          borderRadius: 10,
          padding: '10px 18px',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
          fontFamily: "'Cormorant SC', serif",
        }}
      >
        Обновить
      </button>
    </div>
  );
}
