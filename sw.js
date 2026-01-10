const CACHE_NAME = 'musaudio_pwa_v7';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/pro',
  '/musaumz',
  '/ts.html',
  '/styles.css',
  '/app.js',
  '/musaumz.js',
  '/favicon.gif',
  '/favicon.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        CORE_ASSETS.map(async (p) => {
          try {
            await cache.add(p);
          } catch {}
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

function isApiRequest(url) {
  try {
    const p = url.pathname || '';
    if (p.startsWith('/amp')) return true;
    if (p.startsWith('/health')) return true;
    if (p.startsWith('/engine')) return true;
    if (p.startsWith('/decode')) return true;
    if (p.startsWith('/demucs')) return true;
    if (p.startsWith('/api/')) return true;
    return false;
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  if (isApiRequest(url)) {
    event.respondWith(fetch(req));
    return;
  }

  const isSameOrigin = (() => {
    try {
      return url.origin === self.location.origin;
    } catch {
      return false;
    }
  })();

  if (!isSameOrigin) {
    event.respondWith(fetch(req));
    return;
  }

  const path = url.pathname || '';
  const wantsFresh =
    isSameOrigin &&
    (req.mode === 'navigate' ||
      path === '/' ||
      path.endsWith('.html') ||
      path.endsWith('.js') ||
      path.endsWith('.css') ||
      path.endsWith('.webmanifest'));

  if (wantsFresh) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const res = await fetch(req);
          if (res) {
            try {
              if (res.ok) await cache.put(req, res.clone());
            } catch {}
            return res;
          }
        } catch {}
        const cached = await cache.match(req);
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          try { await cache.put(req, res.clone()); } catch {}
        }
        return res;
      } catch {
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});
