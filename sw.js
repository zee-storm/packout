/* PackOut service worker.

   Markets have bad reception, so the app has to open whether or not the phone
   has signal. Everything the app needs is cached on install; after that the
   cache answers first and the network only refreshes it in the background.

   Bump CACHE whenever the app file changes, or phones will keep serving the
   old one. */

const CACHE = "packout-v1";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      // Individually, so one bad URL can't fail the whole install.
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function freshen(request, cached) {
  // Refresh the cache in the background; never let a network error surface.
  return fetch(request).then(res => {
    if (res && (res.ok || res.type === "opaque")) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
    }
    return res;
  }).catch(() => cached);
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  // A tap on the home screen icon is a navigation. If the network is gone,
  // it still has to open, so fall back to the cached app.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html").then(r => r || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        freshen(req, cached);
        return cached;
      }
      return freshen(req, undefined).then(res => res || Response.error());
    })
  );
});
