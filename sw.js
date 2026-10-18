const CACHE_NAME = 'hts-player-v5.4';   // bump this string on every deploy
const PRECACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/images/icon-192x192.png',
  '/images/icon-512x512.png'
];

// ---------- INSTALL ----------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ---------- ACTIVATE ----------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// ---------- FETCH ----------
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only GETs are cacheable.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never touch cross-origin requests (your CDN: images + m4a audio).
  // Let the browser handle those — caching audio here is a bad idea anyway.
  if (url.origin !== self.location.origin) return;

  // Network-first for everything on our own origin.
  event.respondWith(
    fetch(req)
      .then(res => {
        // Cache a copy of fresh, successful, basic responses.
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => {
        // Network failed — try cache, then fall back to the shell.
        return caches.match(req).then(cached => {
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match('/index.html');
          return Response.error();
        });
      })
  );
});
