/* Garage service worker: caches the app so it opens with no signal. Bump CACHE when files change. */
const CACHE = 'bills-garage-v7';
const ASSETS = ['./', './index.html', './styles.css?v=7', './data.js?v=7', './more.js?v=7', './app.js?v=7', './manifest.webmanifest', './icon.svg', './loader-poster.jpg', './icon-192.png', './icon-512.png', './icon-180.png?v=7', './fonts/bebas-neue-latin-400-normal.woff2', './fonts/public-sans-latin-400-normal.woff2', './fonts/public-sans-latin-500-normal.woff2', './fonts/public-sans-latin-600-normal.woff2', './fonts/public-sans-latin-700-normal.woff2'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;
  if (/\.(mp4|webm)$/.test(url.pathname)) return; // Safari needs range requests for video; let the browser handle it
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined));
      return hit || net;
    })
  );
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./'))));
});
