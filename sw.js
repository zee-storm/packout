/* PackOut service worker.

   Markets have bad reception, so the app has to open whether or not the phone
   has signal. Everything the app needs is cached on install; after that the
   cache answers first and the network only refreshes it in the background.

   Bump CACHE whenever the app file changes, or phones will keep serving the
   old one. */

const CACHE = "packout-17ff5ccf";

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
      /* Individually, so one bad URL can't fail the whole install - and straight
         from the site, not the phone's own short-term copy. The site lets a phone
         keep a page for ten minutes, so a phone that had opened the app just
         before a new version went up stored the OLD page as its offline copy,
         under the new version's name, and ran it whenever it had no signal. */
      .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => null))))
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
  /* Asked fresh each time (a quick "has it changed?" that costs next to nothing
     when it hasn't), so a new version reaches a phone the first time it opens
     with signal. The page that opened is kept as the offline copy, so no signal
     opens the version this phone last ran - never an older one. */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(new Request(req, { cache: "no-cache" }))
        .then(res => {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put("./index.html", copy)).catch(() => {});
          }
          /* The site answering with an error is no reason to show a seller an error
             page while the app is sitting on the phone. On 14 Sep the site was
             switched off for about half an hour: every phone with signal got
             GitHub's "404", and only phones with no signal opened the app. A
             redirect isn't an error and still goes through. */
          if (res && res.status >= 400) {
            return caches.match("./index.html").then(r => r || res);
          }
          return res;
        })
        .catch(() => caches.match("./index.html").then(r => r || Response.error()))
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
