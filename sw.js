const CACHE = "packout-89743253";
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
.then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => null))))
.then(() => self.skipWaiting())
);
});
self.addEventListener("activate", event => {
event.waitUntil(
caches.keys()
.then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
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
const origin = new URL(req.url).origin;
if (origin !== self.location.origin && !FONT_HOSTS.includes(origin)) return;
if (req.mode === "navigate") {
event.respondWith(
fetch(new Request(req, { cache: "no-cache" }))
.then(res => {
if (res && res.ok && res.type === "basic") {
const copy = res.clone();
caches.open(CACHE).then(c => c.put("./index.html", copy)).catch(() => {});
}
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
