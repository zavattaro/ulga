// Ulga — service worker
//  - app shell: cache-first (PRECACHE), works fully offline
//  - voice recordings (audio/…): separate cache 'ulga-audio-v1', filled on demand when a
//    recording is played and by "Pobierz na telefon"; Range requests are answered from the
//    cached file with 206 so seeking works offline.
//  - content/sessions.json: network-first, so recordings published later ("ready": true) show up.
// NEVER add keys/ or scripts/ here (private license key!).
const CACHE_VERSION = 'ulga-v7';
const AUDIO_CACHE = 'ulga-audio-v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/audio.js',
  './js/checkout.js',
  './js/i18n.js',
  './js/ics.js',
  './js/license.js',
  './js/offline.js',
  './js/player.js',
  './js/program.js',
  './js/promo.js',
  './js/state.js',
  './js/storage.js',
  './js/timer.js',
  './js/ui.js',
  './js/screens/activate.js',
  './js/screens/home.js',
  './js/screens/paywall.js',
  './js/screens/player.js',
  './js/screens/progress.js',
  './js/screens/settings.js',
  './js/screens/sounds.js',
  './js/screens/welcome.js',
  './config/brand.json',
  './config/payments.json',
  './locales/pl.json',
  './content/sessions.json',
  './legal/privacy.html',
  './legal/terms.html',
  './legal/refund.html',
  './legal/en/terms.html',
  './legal/en/privacy.html',
  './legal/en/refund.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ulga-') && k !== CACHE_VERSION && k !== AUDIO_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isAudio(url) { return url.pathname.includes('/audio/'); }

/** Build a 206 response for "Range: bytes=a-b" from a full cached response. */
async function rangeResponse(cached, rangeHeader) {
  const buf = await cached.arrayBuffer();
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || '');
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  if (start >= size) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'audio/mp4',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

async function handleAudio(req, url) {
  const cache = await caches.open(AUDIO_CACHE);
  const key = url.origin + url.pathname;
  const cached = await cache.match(key);
  const range = req.headers.get('range');
  if (cached) return range ? rangeResponse(cached, range) : cached;
  // not cached: stream from the network, and store the full file in the background
  const res = await fetch(req);
  if (res.ok) {
    fetch(key, { cache: 'no-store' }).then((full) => {
      if (full.ok && full.status === 200) return cache.put(key, full);
      return null;
    }).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isAudio(url)) {
    event.respondWith(handleAudio(req, url).catch(() => new Response('', { status: 504, statusText: 'Offline' })));
    return;
  }

  // content/sessions.json: network-first (new recordings appear without a new CACHE_VERSION),
  // falling back to the precached copy offline.
  if (url.pathname.endsWith('/content/sessions.json')) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        }
        return caches.match(req, { ignoreSearch: true }).then((c) => c || res);
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((c) => c || new Response('{"sessions":[]}', { headers: { 'Content-Type': 'application/json' } })))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
