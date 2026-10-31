const CACHE = "dks-static-v1";
const ASSETS = ["./", "./index.html", "./assets/css/main.css", "./assets/js/config.js", "./assets/js/i18n.js", "./assets/js/layout.js", "./assets/js/utils.js", "./assets/js/supabase-client.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then((c) => c || fetch(e.request).catch(() => caches.match("./index.html"))));
});
self.addEventListener("push", (e) => {
  let data = { title: "DARKKNIGHT STUDIO", body: "New update", url: "./news.html" };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch (_) {}
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, data: { url: data.url || "./news.html" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || "./"));
});
