const CACHE = 'jus-daylog-today-v3';
const SHELL = ['./', './index.html', '../styles.css', '../themes.css', '../logic.js', '../app.js', '../config.js', './manifest.webmanifest', '../icons/icon.svg', '../icons/icon-192.png', '../icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// Stale-while-revalidate for the app shell. The Apps Script API is another origin and is never cached.
self.addEventListener('fetch', (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
      .catch(() => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
    return hit || net;
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => { for (const c of list) { if ('focus' in c) return c.focus(); } return self.clients.openWindow('./'); }));
});
