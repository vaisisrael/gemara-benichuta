const BASE_PATH = '/gemara-benichuta';
const CACHE_NAME = 'gemara-benichuta-v1';
const OFFLINE_URL = `${BASE_PATH}/he/`;

const CORE_ASSETS = [
  `${BASE_PATH}/he/`,
  `${BASE_PATH}/he/lessons/`,
  `${BASE_PATH}/assets/css/site.css`,
  `${BASE_PATH}/assets/js/site.js`,
  `${BASE_PATH}/assets/js/gemara-glossary-tooltips.js`,
  `${BASE_PATH}/assets/js/shabbat-lock.js`,
  `${BASE_PATH}/assets/icons/icon-192.png`,
  `${BASE_PATH}/assets/icons/icon-512.png`,
  `${BASE_PATH}/manifest.webmanifest`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => (
          (await caches.match(event.request)) ||
          (await caches.match(OFFLINE_URL))
        ))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
