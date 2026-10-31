/* DARKKNIGHT STUDIO SW — static shell only; never cache admin */
const CACHE = "dks-shell-v2";
const SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./assets/css/main.css",
  "./assets/js/config.js",
  "./assets/js/i18n.js",
  "./assets/js/layout.js",
  "./assets/js/utils.js",
  "./assets/js/supabase-client.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // never cache admin or API-ish
  if (url.pathname.includes("admin")) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        // only cache same-origin static shell assets
        const dest = req.destination;
        if (["style", "script", "document"].includes(dest) && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        return cached || caches.match("./offline.html");
      })
  );
});

self.addEventListener("push", (e) => {
  let data = { title: "DARKKNIGHT STUDIO", body: "New update", url: "./news.html" };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { url: data.url || "./news.html" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "./";
  e.waitUntil(clients.openWindow(url));
});
