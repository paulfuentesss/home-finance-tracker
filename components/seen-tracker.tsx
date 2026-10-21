"use client";

// Tells the server this member is using My House, and from where: the installed app or a browser,
// on which kind of device (lib/devices.ts; shown to the admin on Manage). Only the browser knows
// either. On every signed-in page (AppShell), when it opens and when the tab comes back into
// view, at most every 5 minutes; the server throttles too. Failures are ignored — it's only a note.

import { useEffect } from "react";
import { isInstalledApp, platformOf } from "@/lib/devices";

const EVERY_MS = 5 * 60 * 1000;
let lastSentAt = 0;

function post(extra: { drawnAt?: number } = {}) {
  fetch("/api/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      via: isInstalledApp() ? "app" : "web",
      platform: platformOf(navigator.userAgent, navigator.maxTouchPoints),
      ...extra,
    }),
    keepalive: true,
  }).catch(() => {});
}

function report() {
  if (document.visibilityState !== "visible" || Date.now() - lastSentAt < EVERY_MS) return;
  lastSentAt = Date.now();
  post();
}

export function SeenTracker() {
  useEffect(() => {
    report();
    document.addEventListener("visibilitychange", report);
    return () => document.removeEventListener("visibilitychange", report);
  }, []);
  return null;
}

/**
 * On a month page: marks the bill emails sent before the server drew it as seen (the admin's
 * "✓ sent · seen" on Settle Up; docs/features/reminders.md). Once per page shown, when it's
 * actually on screen — not for a prefetch, and not for an old tab coming back into view, whose
 * page may be from before the bill went out (that's what `drawnAt` is for). Not rendered for the
 * admin or while previewing.
 */
export function BillSeen({ drawnAt }: { drawnAt: number }) {
  useEffect(() => {
    if (document.visibilityState === "visible") {
      post({ drawnAt });
      return;
    }
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      post({ drawnAt });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [drawnAt]);
  return null;
}
