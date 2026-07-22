import { useEffect } from 'react';

function getDeviceKind(width: number) {
  if (width >= 1024) return 'desktop';
  if (width >= 768) return 'tablet';
  return 'phone';
}

function isAppleDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function useDeviceProfile() {
  useEffect(() => {
    const applyProfile = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const root = document.documentElement;

      root.style.setProperty('--viewport-height', `${height}px`);
      root.style.setProperty('--viewport-width', `${width}px`);
      root.dataset.device = getDeviceKind(width);
      root.dataset.orientation = width > height ? 'landscape' : 'portrait';
      root.dataset.platform = isAppleDevice() ? 'ios' : 'generic';
      root.dataset.displayMode = window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser';
    };

    applyProfile();
    window.addEventListener('resize', applyProfile);
    window.addEventListener('orientationchange', applyProfile);
    window.visualViewport?.addEventListener('resize', applyProfile);
    window.visualViewport?.addEventListener('scroll', applyProfile);

    return () => {
      window.removeEventListener('resize', applyProfile);
      window.removeEventListener('orientationchange', applyProfile);
      window.visualViewport?.removeEventListener('resize', applyProfile);
      window.visualViewport?.removeEventListener('scroll', applyProfile);
    };
  }, []);
}
