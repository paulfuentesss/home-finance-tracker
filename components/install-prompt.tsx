"use client";

// The "Install My House" card at the bottom of the screen (docs/features/install-app.md).
// Browsers differ, so the card does too:
// - Chrome/Edge/Samsung Internet: an Install button, once the browser says it may offer one
//   (`beforeinstallprompt`; the browser picks when, and never once the app is installed).
// - iPhone/iPad: Apple has no install prompt, so the card explains Share → Add to Home Screen.
//   Safari can't tell whether it's been added, so "I've added it" stops the card on that phone.
// - Messenger/Facebook/Instagram's built-in browser can't install, so it says to open a real one.
// Nothing shows inside the installed app. "Not now" hides it until the next day. "Install app"
// in the account menu (openInstallCard) brings it back any time.

import { House, Share } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { isInstalledApp, platformOf } from "@/lib/devices";

/** Chrome's install event; not in TypeScript's DOM types. */
type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** `menu`: opened from the account menu where the browser offers no install dialog. */
type Card = "none" | "install" | "ios" | "in-app" | "menu";

/** The day "Not now" was tapped (the card comes back on a later day). */
const DISMISSED_KEY = "my-house:install-dismissed-on";
/** Set by "I've added it" on an iPhone/iPad. */
const ADDED_KEY = "my-house:install-added";

// Kept outside React: the browser can fire its install event before the card has mounted.
let installEvent: InstallEvent | null = null;
/** Hidden for the rest of this visit (dismissed, or just installed). */
let hidden = false;
/** Opened from the account menu: shown whatever was dismissed before. */
let opened = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // our card instead of Chrome's own bar
    installEvent = event as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    hidden = true;
    opened = false;
    notify();
  });
}

function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode): just show the card
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered; it stays hidden until the next page load.
  }
}

/** Today in the phone's own time zone, so "tomorrow" starts at its midnight. */
const today = () => new Date().toDateString();

function isIos() {
  const platform = platformOf(navigator.userAgent, navigator.maxTouchPoints);
  return platform === "iphone" || platform === "ipad";
}

function currentCard(): Card {
  if (isInstalledApp()) return "none";
  if (!opened && (hidden || stored(DISMISSED_KEY) === today() || stored(ADDED_KEY))) return "none";
  if (/FBAN|FBAV|FB_IAB|Instagram/.test(navigator.userAgent)) return "in-app";
  if (isIos()) return "ios";
  if (installEvent) return "install";
  return opened ? "menu" : "none";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** "Not now": back on a later day. */
function dismiss() {
  hidden = true;
  opened = false;
  store(DISMISSED_KEY, today());
  notify();
}

/** "I've added it" (iPhone/iPad): never again on this phone, unless opened from the menu. */
function markAdded() {
  hidden = true;
  opened = false;
  store(ADDED_KEY, "1");
  notify();
}

async function install() {
  const event = installEvent;
  if (!event) return;
  installEvent = null; // each event can prompt only once
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "dismissed") dismiss();
  else notify();
}

/** "Install app" in the account menu: show the card now, even if it was dismissed. */
export function openInstallCard() {
  hidden = false;
  opened = true;
  notify();
}

/** False inside the installed app, where "Install app" has nothing to do. */
export function useShowInstallItem() {
  return useSyncExternalStore(subscribe, () => !isInstalledApp(), () => false);
}

export function InstallPrompt() {
  const card = useSyncExternalStore(subscribe, currentCard, () => "none" as Card);

  useEffect(() => {
    // Fails quietly where service workers aren't allowed (e.g. some in-app browsers).
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
  }, []);

  if (card === "none") return null;

  return (
    <section
      aria-label="Install My House"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-lg"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600">
        <House className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        {card === "install" && (
          <>
            <p className="font-medium">Install My House</p>
            <p className="text-sm text-muted-foreground">Opens like an app, from your home screen.</p>
          </>
        )}
        {card === "ios" && (
          <>
            <p className="font-medium">Add My House to your Home Screen</p>
            <p className="text-sm text-muted-foreground">
              Tap Share <Share className="inline size-3.5 align-[-2px]" aria-label="(the share icon)" /> (or ••• then
              Share), then <span className="font-medium text-foreground">Add to Home Screen</span>.
            </p>
          </>
        )}
        {card === "in-app" && (
          <>
            <p className="font-medium">Open in your browser to install</p>
            <p className="text-sm text-muted-foreground">
              This app&apos;s built-in browser can&apos;t install My House. Tap ••• and choose{" "}
              <span className="font-medium text-foreground">Open in browser</span> (Chrome or Safari).
            </p>
          </>
        )}
        {card === "menu" && (
          <>
            <p className="font-medium">Install from your browser&apos;s menu</p>
            <p className="text-sm text-muted-foreground">
              In Chrome or Edge: <span className="font-medium text-foreground">⋮ → Install app</span> (on some
              phones, Add to Home screen). Not there? My House is already installed, or this browser can&apos;t
              install apps (Safari on a Mac: File → Add to Dock).
            </p>
          </>
        )}
        <div className="mt-3 flex justify-end gap-2">
          {card === "ios" && (
            <Button variant="ghost" size="sm" onClick={markAdded}>
              I&apos;ve added it
            </Button>
          )}
          <Button variant={card === "ios" ? "outline" : "ghost"} size="sm" onClick={dismiss}>
            {card === "in-app" || card === "menu" ? "Got it" : "Not now"}
          </Button>
          {card === "install" && (
            <Button size="sm" onClick={install}>
              Install
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
