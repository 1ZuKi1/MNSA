/*
 * Service worker for the team web (team.pkumongolia.com) installed as an app.
 *   - shows notifications sent by the Worker (src/lib/push.ts) and opens the right page when one is tapped
 *   - shows a short "no internet" page instead of the browser's error when the phone is offline
 * It caches nothing else: staff pages are private and must always be fresh.
 * Served only on the staff host (src/worker.ts returns 404 for it on the public site).
 */
const ICON = '/brand/app-192.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { body: event.data ? event.data.text() : '' };
  }
  // Apple and Google both require every push to show something; an empty message still gets a title.
  event.waitUntil(
    self.registration.showNotification(d.title || 'МОХ ажлын орчин', {
      body: d.body || '',
      icon: ICON,
      badge: ICON,
      tag: d.tag || undefined,
      renotify: !!d.tag,
      lang: 'mn',
      data: { url: d.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // The app already open: bring it forward and go to the page. Otherwise open it there.
      for (const c of list) {
        if (new URL(c.url).origin !== self.location.origin) continue;
        return c.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : self.clients.openWindow(url))).catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    }),
  );
});

// Apple or Google replaced the subscription (rare): tell the server the new one.
self.addEventListener('pushsubscriptionchange', (event) => {
  const old = event.oldSubscription;
  const key = old && old.options && old.options.applicationServerKey;
  if (!key) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).then((sub) =>
      fetch('/push', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', subscription: sub.toJSON() }),
      }),
    ),
  );
});

const OFFLINE = `<!doctype html><html lang="mn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0d2138"><title>Интернэт алга · МОХ</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f1ea;color:#1c1917;font:16px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif;padding:24px;box-sizing:border-box;text-align:center}
h1{font-size:1.3rem;margin:0 0 8px}p{margin:0 0 20px;color:#4a4540}
button{font:inherit;font-weight:600;padding:12px 22px;border:0;border-radius:10px;background:#005faf;color:#fff}</style></head>
<body><main><h1>Интернэт холболт алга</h1><p>Сүлжээгээ шалгаад дахин оролдоно уу.</p>
<button onclick="location.reload()">Дахин оролдох</button></main></body></html>`;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate' || req.method !== 'GET') return; // everything else goes straight to the network
  event.respondWith(
    fetch(req).catch(() => new Response(OFFLINE, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } })),
  );
});
