/* Draft21 service worker.
 *
 * Purpose: the app shell must open at the pitch on a weak or dead connection.
 * It deliberately does NOT try to make the draft work offline — Firestore
 * traffic is never touched here, and the app shows its own connectivity state.
 *
 * IMPORTANT: bump CACHE whenever any shell file changes, otherwise installed
 * phones keep serving the previous version until the cache name differs.
 */
const CACHE = 'draft21-shell-v2';

const SHELL = [
  './',
  './index.html',
  './design.css',
  './script.js',
  './manifest.json',
  './draft21icon.png',
  './vendor/firebase-app.js',
  './vendor/firebase-firestore.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Deliberately no skipWaiting: a new version takes over on the next launch
// rather than reloading a phone in the middle of a live draft.

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Anything cross-origin (Firestore included) is left entirely alone.
  if (url.origin !== self.location.origin) return;

  // Stale-while-revalidate: cached shell paints immediately even on a bad
  // connection, and the cache refreshes in the background for next launch.
  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req).then(cached => {
        const network = fetch(req)
          .then(res => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(req, res.clone()).catch(() => {});
            }
            return res;
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(network);
          return cached;
        }
        return network.then(res => {
          if (res) return res;
          // Offline cold start on a deep link: serve the cached shell so the
          // app can render its own "no connection" screen.
          if (req.mode === 'navigate') {
            return cache.match('./index.html').then(idx => idx || Response.error());
          }
          return Response.error();
        });
      })
    )
  );
});
