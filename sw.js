const CACHE_NAME = "ironlog-shell-v13";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./v2.html",
  "./app.js",
  "./style.css",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./styles/app.css",
  "./ui/app.js",
  "./ui/store.js",
  "./ui/session.js",
  "./ui/train.js",
  "./ui/tabs.js",
  "./ui/dom.js",
  "./ui/rest.js",
  "./ui/coach.js",
  "./ui/md.js",
  "./ui/switch.js",
  "./engine/alternatives.js",
  "./engine/seed/free-exercise-db.js",
  "./data/trials.js",
  "./engine/index.js",
  "./engine/catalog.js",
  "./engine/model.js",
  "./engine/prescribe.js",
  "./engine/replay.js",
  "./engine/meso.js",
  "./engine/seed/curated.js",
  "./data/config.js",
  "./data/sheets.js",
  "./data/log.js",
  "./data/program.js",
  "./data/catalog-store.js",
  "./data/constraints.js",
  "./engine/recovery.js",
  "./engine/validate.js",
  "./engine/assess.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Network-first for the app shell — this app gets redeployed often, so an
// online device should always pick up the latest code, never a stale cached
// bug. Falls back to whatever was last cached only when the network is
// actually down, and to index.html as a last resort for a navigation with
// nothing cached yet. Cross-origin requests (Apps Script, Google Fonts, the
// Chart.js CDN) are never intercepted — caching live workout data would show
// stale sessions, and caching third-party scripts isn't this file's job.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});

// Tapping a rest notification brings IronLog back to the front.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => "focus" in c);
      return win ? win.focus() : self.clients.openWindow("./index.html");
    })
  );
});
