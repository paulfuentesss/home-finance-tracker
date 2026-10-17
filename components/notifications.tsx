"use client";

// Push notifications on this phone or browser (docs/features/notifications.md). Each device turns
// them on for itself: the browser asks permission (only ever from a tap — iPhones require it),
// then gives a subscription (the push service's address for this device), saved through
// /api/push. lib/push.ts sends; public/sw.js shows them.
//
// - NotificationsMenuItem: in the account menu, on/off for this device, and why not when it can't.
// - NotificationsCard: a one-time "Turn on" card, only inside the installed app. Also re-saves this
//   device's subscription when the app opens, so a renewed one (or one removed after a failed send)
//   comes back by itself.
// - forgetThisDevice: before signing out, so the next person on this phone doesn't get them.
//
// View-only logins get no pushes, so neither shows for them. Off when the VAPID public key isn't set.

import { Bell, BellOff } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { usePreviewBy, useViewer } from "@/components/viewer-context";
import { isInstalledApp, platformOf } from "@/lib/devices";
import { isAdmin, isViewOnly } from "@/lib/permissions";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
/** "Not now" on the card: it never comes back on this device (the menu still has it). */
const CARD_DISMISSED_KEY = "my-house:notifications-card-dismissed";
/** Told to every menu and card on the page when one of them turns notifications on or off. */
const CHANGED_EVENT = "my-house:notifications-changed";

/**
 * - `unsupported`: this browser can't (or push isn't set up).
 * - `needs-install`: an iPhone/iPad in a browser tab — only the home-screen app can get them.
 * - `blocked`: permission was refused; only the phone's settings can undo that.
 */
type Status = "checking" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

function isApple() {
  const platform = platformOf(navigator.userAgent, navigator.maxTouchPoints);
  return platform === "iphone" || platform === "ipad";
}

function supported() {
  return Boolean(PUBLIC_KEY) && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The service worker (registered by components/install-prompt.tsx), or null if it isn't there soon. */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))]);
}

async function currentStatus(): Promise<Status> {
  if (!supported()) return isApple() && !isInstalledApp() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await registration();
  if (!reg) return "unsupported";
  const subscription = await reg.pushManager.getSubscription();
  return subscription && Notification.permission === "granted" ? "on" : "off";
}

/** The VAPID public key as the bytes pushManager.subscribe wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function save(subscription: PushSubscription): Promise<boolean> {
  const response = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      platform: platformOf(navigator.userAgent, navigator.maxTouchPoints),
    }),
  });
  return response.ok && !response.redirected;
}

/** Asks permission (call only from a tap), subscribes and saves. Returns the new status. */
async function turnOn(): Promise<Status> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";
  const reg = await registration();
  if (!reg || !PUBLIC_KEY) return "unsupported";
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
  if (await save(subscription)) return "on";
  await subscription.unsubscribe().catch(() => {});
  throw new Error("save failed");
}

async function turnOff(): Promise<Status> {
  const reg = await registration();
  const subscription = await reg?.pushManager.getSubscription();
  if (subscription) {
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  }
  return "off";
}

/**
 * Before signing out: stop this device's notifications, so the next person signed in here doesn't
 * get them. Best effort, and never more than ~2 s — signing out goes ahead whatever happens.
 */
export async function forgetThisDevice(): Promise<void> {
  if (!supported()) return;
  await Promise.race([turnOff().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2000))]);
}

function useNotifications() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  // Checked when shown, and again whenever the other one (menu or card) turns them on or off, so
  // the card never stays up after the menu turned them on.
  useEffect(() => {
    let live = true;
    const check = () =>
      currentStatus()
        .then((s) => live && setStatus(s))
        .catch(() => live && setStatus("unsupported"));
    check();
    window.addEventListener(CHANGED_EVENT, check);
    return () => {
      live = false;
      window.removeEventListener(CHANGED_EVENT, check);
    };
  }, []);

  const change = useCallback(async (to: "on" | "off") => {
    setBusy(true);
    setError(false);
    try {
      setStatus(await (to === "on" ? turnOn() : turnOff()));
      window.dispatchEvent(new Event(CHANGED_EVENT));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, error, change };
}

/** The real login on this device, also while PA previews as a housemate. */
function useRealViewer() {
  const viewer = useViewer();
  return usePreviewBy() ?? viewer;
}

function useGetsPushes() {
  return !isViewOnly(useRealViewer());
}

const HELP: Partial<Record<Status, string>> = {
  "needs-install": "Add My House to your Home Screen, open it from there, then turn this on.",
  blocked: "Notifications are blocked for My House. Allow them in your phone's or browser's settings.",
  unsupported: "This browser can't get notifications.",
};

/** The account menu's row: notifications on or off for this device. */
export function NotificationsMenuItem({ itemClass }: { itemClass: string }) {
  const getsPushes = useGetsPushes();
  const { status, busy, error, change } = useNotifications();
  if (!getsPushes || !PUBLIC_KEY || status === "checking") return null;
  const on = status === "on";
  const help = error ? "Couldn't change it. Try again in a moment." : HELP[status];
  return (
    <div className="border-t border-white/10 p-1">
      {status === "on" || status === "off" ? (
        <button type="button" disabled={busy} onClick={() => change(on ? "off" : "on")} className={itemClass}>
          {on ? (
            <BellOff className="size-4 text-zinc-400" aria-hidden />
          ) : (
            <Bell className="size-4 text-zinc-400" aria-hidden />
          )}
          {on ? "Turn off notifications" : "Turn on notifications"}
        </button>
      ) : (
        <p className="flex items-center gap-2 px-2 py-2 text-sm text-zinc-300">
          <BellOff className="size-4 shrink-0 text-zinc-400" aria-hidden />
          Notifications
        </p>
      )}
      {(help || on) && (
        <p className="px-2 pb-1.5 text-xs text-zinc-400">{help ?? "On for this device. Emails still come too."}</p>
      )}
    </div>
  );
}

/** Installed-or-not and "Not now" don't change while the page is open (Not now is local state). */
const noUpdates = () => () => {};

function dismissed() {
  try {
    return localStorage.getItem(CARD_DISMISSED_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Inside the installed app only (the install card never shows there, so they don't collide): a
 * one-time "Turn on" card, and a quiet re-save of this device's subscription each time it opens.
 */
export function NotificationsCard() {
  const getsPushes = useGetsPushes();
  const admin = isAdmin(useRealViewer());
  const { status, busy, error, change } = useNotifications();
  // Read from the browser (false on the server, so there's no flash before it knows).
  const fresh = useSyncExternalStore(noUpdates, () => isInstalledApp() && !dismissed(), () => false);
  const [closed, setClosed] = useState(false);
  const hidden = !fresh || closed;

  // Keeps the saved subscription in step with the browser's (it can renew it on its own).
  useEffect(() => {
    if (status !== "on") return;
    registration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((subscription) => subscription && save(subscription))
      .catch(() => {});
  }, [status]);

  if (!getsPushes || !PUBLIC_KEY || hidden || status !== "off") return null;

  function notNow() {
    try {
      localStorage.setItem(CARD_DISMISSED_KEY, "1");
    } catch {
      // Not remembered: it shows again next time the app opens.
    }
    setClosed(true);
  }

  return (
    <section
      aria-label="Turn on notifications"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-lg"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600">
        <Bell className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">Get notified on this phone</p>
        <p className="text-sm text-muted-foreground">
          {error
            ? "Couldn't turn them on. Try again in a moment."
            : admin
              ? "A quick heads-up when a housemate pays or a bill arrives. Emails still come too."
              : "A quick heads-up when your bill is ready or a payment is confirmed. Emails still come too."}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={notNow}>
            Not now
          </Button>
          <Button size="sm" disabled={busy} onClick={() => change("on")}>
            Turn on
          </Button>
        </div>
      </div>
    </section>
  );
}
