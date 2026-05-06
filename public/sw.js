// Service Worker - Inventario J.assy
// Recebe Web Push e exibe notificacoes.

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "Inventario J.assy", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Inventario J.assy";
  const options = {
    body: data.body || "Hora de registrar coletas no sistema.",
    icon: data.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "jassy-reminder",
    renotify: true,
    data: { url: data.url || "/coleta" },
    vibrate: [180, 80, 180],
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Atualiza app badge se suportado (Chrome Android / iOS 16.4+ PWA instalado)
      "setAppBadge" in self.navigator
        ? self.navigator.setAppBadge().catch(() => {})
        : Promise.resolve(),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/coleta";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(url).catch(() => {});
          return w.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
