// Push only: shows the evening reminder and opens the planner when tapped.
// No fetch handler, so nothing is cached and there is no offline mode.

self.addEventListener("push", (event) => {
  let msg = { title: "Life Goals", body: "", url: "/today" };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {
    // A push without JSON still shows the default.
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: msg.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/today", self.location)
    .href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = open.find(
        (c) => new URL(c.url).origin === self.location.origin,
      );
      if (client) {
        await client.focus();
        return client.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
