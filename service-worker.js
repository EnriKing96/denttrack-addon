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
'./manifest.json'
];

self.addEventListener('install', (event) => {
event.waitUntil(
caches.open(CACHE_NAME)
.then(cache => cache.addAll(ASSETS_TO_CACHE))
.then(() => self.skipWaiting())
);
});

self.addEventListener('activate', (event) => {
event.waitUntil(
caches.keys().then(keys =>
Promise.all(
keys
.filter(key => key !== CACHE_NAME)
.map(key => caches.delete(key))
)
).then(() => self.clients.claim())
);
});

self.addEventListener('fetch', (event) => {
if (event.request.method !== 'GET') return;

event.respondWith(
caches.match(event.request).then(cachedResponse => {
return cachedResponse || fetch(event.request).catch(() => {
if (event.request.mode === 'navigate') {
return caches.match('./index.html');
}
});
})
);
});
