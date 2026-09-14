/* PackOut service worker.

   Markets have bad reception, so the app has to open whether or not the phone
   has signal. Everything the app needs is cached on install; after that the
   cache answers first and the network only refreshes it in the background.

   Bump CACHE whenever the app file changes, or phones will keep serving the
   old one. */

const CACHE = "packout-1d1de6b9";

// The typefaces, so the app still looks like itself with no signal. Public
// files with nobody's data in them - the one kind of outside request worth
// keeping.
const FONT_HOSTS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];

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
      // Anything from another site that an older version stored - database
      // answers with cash in them, the owner's list of sign-in codes - goes,
      // even if this cache happened to keep its name.
      .then(() => caches.open(CACHE))
      .then(c => c.keys().then(reqs => Promise.all(
        reqs.filter(r => { const o = new URL(r.url).origin;
                           return o !== self.location.origin && !FONT_HOSTS.includes(o); })
            .map(r => c.delete(r))
      )))
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

  /* Only the app's own files. Everything else - above all the database -
     goes straight to the network, untouched.

     This used to answer every request from its store first, the database's
     included. So the owner's screen showed the load before last, the check
     for "did my day really arrive?" could read an old "not there" and send a
     day twice, and days with cash in them and the owner's list of codes sat
     on the phone after signing out, for whoever picked it up next. */
  const origin = new URL(req.url).origin;
  if (origin !== self.location.origin && !FONT_HOSTS.includes(origin)) return;

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
