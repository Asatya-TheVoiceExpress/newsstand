var CACHE = "ve-shell-20260922191355";
var DOWNLOADS_CACHE = "ve-downloads-v1";
var SCOPE = self.registration.scope; 
var SHELL = ["", "index.html", "app.css", "app.js", "qr.js", "manifest.webmanifest", "logo.png", "config.json"]
  .map(function (p) { return new URL(p, SCOPE).href; });
var SHELL_SET = {};
SHELL.forEach(function (u) { SHELL_SET[u] = true; });

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k !== CACHE && k !== DOWNLOADS_CACHE && k.indexOf("ve-shell-") === 0;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isShellUrl(url) {
  return !!SHELL_SET[url.href];
}

function isUploadUrl(url) {
  return url.pathname.indexOf("/static/uploads/") !== -1;
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.open(DOWNLOADS_CACHE).then(function (dc) {
      return dc.match(req).then(function (dcached) {
        if (dcached) return dcached;
        return handleOther(req, url);
      });
    }).catch(function () { return fetch(req); })
  );
});

function handleOther(req, url) {
  if (url.pathname.endsWith("/catalog.json")) {
    return fetch(req).then(function (res) {
      caches.open(CACHE).then(function (c) { c.put(req, res.clone()); }).catch(function () {});
      return res;
    }).catch(function () { return caches.match(req); });
  }

  if (isShellUrl(url)) {
    return fetch(req).then(function (res) {
      if (res && res.ok) {
        caches.open(CACHE).then(function (c) { c.put(req, res.clone()); }).catch(function () {});
      }
      return res;
    }).catch(function () { return caches.match(req); });
  }

  if (isUploadUrl(url)) {
    return caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          caches.open(CACHE).then(function (c) { c.put(req, res.clone()); }).catch(function () {});
        }
        return res;
      });
    });
  }

  return fetch(req);
}

function resolveUrl(u) {
  return new URL(u, SCOPE).href;
}

function replyTo(source, msg) {
  if (source && source.postMessage) {
    source.postMessage(msg);
    return;
  }
  self.clients.matchAll().then(function (list) {
    list.forEach(function (c) { c.postMessage(msg); });
  });
}

self.addEventListener("message", function (e) {
  var data = e.data;

  if (data === "skipWaiting") {
    self.skipWaiting();
    return;
  }

  if (!data || typeof data !== "object") return;

  if (data.type === "cache-download") {
    var url = resolveUrl(data.url);
    caches.open(DOWNLOADS_CACHE).then(function (c) {
      return c.add(url);
    }).then(function () {
      replyTo(e.source, { type: "cache-download-ok", url: data.url });
    }).catch(function () {
      replyTo(e.source, { type: "cache-download-fail", url: data.url });
    });
    return;
  }

  if (data.type === "uncache-download") {
    var delUrl = resolveUrl(data.url);
    caches.open(DOWNLOADS_CACHE).then(function (c) {
      return c.delete(delUrl);
    }).then(function () {
      replyTo(e.source, { type: "uncache-download-ok", url: data.url });
    }).catch(function () {
      replyTo(e.source, { type: "uncache-download-ok", url: data.url });
    });
    return;
  }

  if (data.type === "list-downloads") {
    caches.open(DOWNLOADS_CACHE).then(function (c) {
      return c.keys();
    }).then(function (reqs) {
      var urls = reqs.map(function (r) { return r.url; });
      replyTo(e.source, { type: "downloads-list", urls: urls });
    }).catch(function () {
      replyTo(e.source, { type: "downloads-list", urls: [] });
    });
    return;
  }
});
