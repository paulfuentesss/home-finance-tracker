"use client";

// Tells the server this member is using My House, and from where: the installed app or a browser,
// on which kind of device (lib/devices.ts; shown to the admin on Manage). Only the browser knows
// either. On every signed-in page (AppShell), when it opens and when the tab comes back into
// view, at most every 5 minutes; the server throttles too. Failures are ignored — it's only a note.

import { useEffect } from "react";
import { isInstalledApp, platformOf } from "@/lib/devices";

const EVERY_MS = 5 * 60 * 1000;
let lastSentAt = 0;

function report() {
  if (document.visibilityState !== "visible" || Date.now() - lastSentAt < EVERY_MS) return;
  lastSentAt = Date.now();
  fetch("/api/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      via: isInstalledApp() ? "app" : "web",
      platform: platformOf(navigator.userAgent, navigator.maxTouchPoints),
    }),
    keepalive: true,
  }).catch(() => {});
}

export function SeenTracker() {
  useEffect(() => {
    report();
    document.addEventListener("visibilitychange", report);
    return () => document.removeEventListener("visibilitychange", report);
  }, []);
  return null;
}
