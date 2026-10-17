// My House's service worker (docs/features/install-app.md). Registered by
// components/install-prompt.tsx. It stores NOTHING: no Cache Storage, no household data on the
// device. Two jobs: a fallback page when a page can't load because there's no connection — a real
// fetch handler, which Chrome wants before it offers to install the app — and showing push
// notifications (docs/features/notifications.md; sent by lib/push.ts, words in
// lib/push-messages.ts), opening the right page when one is tapped.
//
// Kill switch: if this file ever breaks the site on phones, replace everything below with
//   self.addEventListener("install", () => self.skipWaiting());
//   self.addEventListener("activate", () => self.registration.unregister());
// and deploy. /sw.js is never cached (next.config.ts), so phones pick it up on their next visit.
// Unregistering also drops every phone's notifications: each has to turn them on again.

const OFFLINE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My House</title>
<style>
  body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    background: #fafafa; color: #18181b; font-family: system-ui, sans-serif; text-align: center; padding: 16px; }
  h1 { font-size: 1.125rem; color: #b45309; margin: 0 0 8px; }
  p { margin: 0 0 20px; color: #52525b; }
  button { font: inherit; padding: 8px 16px; border-radius: 8px; border: 0; background: #d97706; color: #fff; }
</style>
</head>
<body>
<main>
  <h1>No connection</h1>
  <p>My House needs the internet. Check your connection and try again.</p>
  <button onclick="location.reload()">Try again</button>
</main>
</body>
</html>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Lets the page request start while the worker wakes up, so pages don't load slower.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only page loads. Server Actions, data fetches, sign-in and files go straight to the network.
  if (request.method !== "GET" || request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) || (await fetch(request));
      } catch {
        // Only a network failure lands here; an error page from the server still shows as usual.
        return new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })(),
  );
});

// A push from lib/push.ts: { title, body, url, tag }. Always shows one — iPhones stop delivering
// to an app that receives a push without showing it.
self.addEventListener("push", (event) => {
  let push = {};
  try {
    push = event.data ? event.data.json() : {};
  } catch {
    // Not ours, or garbled: still show something rather than nothing.
  }
  event.waitUntil(
    self.registration.showNotification(push.title || "My House", {
      body: push.body || "",
      icon: "/icons/icon-192.png",
      tag: push.tag,
      // A newer push about the same thing replaces the older one — and still alerts, instead of
      // swapping it in silently (browsers that don't know `renotify` just ignore it).
      renotify: Boolean(push.tag),
      // Only a path in this app ("//other.site" would leave it).
      data: { url: typeof push.url === "string" && /^\/(?!\/)/.test(push.url) ? push.url : "/" },
    }),
  );
});

// Tapped: bring My House forward on that page (an open window if there is one, else a new one).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ("navigate" in open) return open.navigate(url).catch(() => self.clients.openWindow(url));
        return undefined;
      }
      return self.clients.openWindow(url);
    })(),
  );
});
