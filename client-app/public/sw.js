// ═══════════════════════════════════════════════════════
// Service Worker — Умная Усадьба PWA
// ═══════════════════════════════════════════════════════
const CACHE = 'usadba-v3';

// Install: cache shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll([
      '/icons/icon-192.png',
      '/icons/icon-512.png',
    ]).catch(() => {}))
  );
  // Skip waiting on install — prevent stale cache from breaking the app
  // (We'll do proper update-notification flow once the app is stable)
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  // Claim immediately — new SW takes control of all pages
  self.clients.claim();
});

// Message: handle update request from client
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch strategy
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET
  if (e.request.method !== 'GET') return;

  // API: pass through (don't cache)
  if (url.pathname.startsWith('/api/')) return;

  // JS/CSS assets: stale-while-revalidate (content-hash → immutable in practice)
  if (url.pathname.includes('/assets/')) {
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }

  // HTML pages (/start, /manifest.json): network-first — always get latest
  // This prevents white screen from stale HTML referencing deleted JS bundles
  if (url.pathname === '/start' || url.pathname === '/manifest.json' || url.pathname === '/') {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Static: cache-first
  e.respondWith(cacheFirst(e.request));
});

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ ok: false, error: 'offline' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put(request, res.clone());
    return res;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(res => {
    cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}
