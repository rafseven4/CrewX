const CACHE_VERSION = 'crewx-cache-v14';

const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=16',
  './app.js?v=17',
  './manifest.json',
  './offline.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png'
];
// Keep the ?v= numbers above in sync with index.html and bump CACHE_VERSION.

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nie cache'ujemy Firebase, Google Fonts, Cloud Functions ani innych zewnętrznych API.
  if (url.origin !== self.location.origin) return;

  // HTML navigation: najpierw sieć, potem cache/offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Only cache a real page — never an error response
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(async () => {
          const cachedIndex = await caches.match('./index.html');
          return cachedIndex || caches.match('./offline.html');
        })
    );
    return;
  }

  // Static files: cache first + update w tle.
  event.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
          }

          return response;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
