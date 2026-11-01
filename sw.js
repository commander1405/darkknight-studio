/* DARKKNIGHT STUDIO SW — shell cache + Web Push */
const CACHE = "dks-shell-v3";
const SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./notifications.html",
  "./assets/css/main.css",
  "./assets/js/config.js",
  "./assets/js/i18n.js",
  "./assets/js/layout.js",
  "./assets/js/utils.js",
  "./assets/js/supabase-client.js",
  "./assets/js/push.js",
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
  if (url.pathname.includes("admin")) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
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
  let data = {
    title: "DARKKNIGHT STUDIO",
    body: "",
    url: "./index.html",
    tag: "dks-generic",
  };
  try {
    if (e.data) {
      const parsed = e.data.json();
      data = { ...data, ...parsed };
    }
  } catch (_) {
    try {
      data.body = e.data ? e.data.text() : data.body;
    } catch (__) {}
  }
  e.waitUntil(
    self.registration.showNotification(data.title || "DARKKNIGHT STUDIO", {
      body: data.body || "",
      icon: "./assets/icons/icon.svg",
      badge: "./assets/icons/icon.svg",
      tag: data.tag || "dks",
      renotify: !!data.renotify,
      data: { url: data.url || "./index.html" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let url = e.notification.data?.url || "./index.html";
  // relative → absolute under SW scope
  try {
    url = new URL(url, self.registration.scope).href;
  } catch (_) {}
  e.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: "window", includeControlled: true });
      for (const c of all) {
        if (c.url.startsWith(self.registration.scope) && "focus" in c) {
          await c.focus();
          if ("navigate" in c) {
            try { await c.navigate(url); } catch (_) {}
          }
          return;
        }
      }
      await clients.openWindow(url);
    })()
  );
});
