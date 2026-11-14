// Service Worker for 100% offline capabilities
// Service Worker DentTrack
const CACHE_NAME = 'denttrack-cache-v2';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './storage.js',
  './clinics.js',
  './shifts.js',
  './calendar.js',
  './reports.js',
  './export.js',
  './app.js',
  './icon.svg',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.map(k => {
          if (k !== CACHE_NAME) {
            return caches.delete(k);
          }
        })
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request)
      .then(res => res || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
