/* Voice Express Stand — service worker.
   Shell (html/css/js/manifest/logo) is cache-first + refreshed in the background.
   catalog.json is network-first so new issues show up without needing a reinstall.
   Bump CACHE on every deploy to retire the previous shell cache. */
var CACHE = "ve-shell-v3";
var SCOPE = self.registration.scope; /* e.g. https://host/voiceexpressstand/ — works under any subpath */
var SHELL = ["", "index.html", "app.css", "app.js", "qr.js", "manifest.webmanifest", "logo.png", "config.json"]
  .map(function (p) { return new URL(p, SCOPE).href; });

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.endsWith("/catalog.json")) {
    e.respondWith(
      fetch(req).then(function (res) {
        caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});

self.addEventListener("message", function (e) {
  if (e.data === "skipWaiting") self.skipWaiting();
});
