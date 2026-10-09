// Starting and ending "Preview as a housemate" (lib/preview.ts) — browser only: it writes
// document.cookie, so the server can't call it (signOut deletes the cookie its own way). The
// cookie is shared by every tab, so other open tabs are told to redraw too.

import { PREVIEW_COOKIE } from "@/lib/preview";

/** How long a preview lasts if PA never exits it (a browser restoring its last session keeps it). */
const PREVIEW_SECONDS = 4 * 60 * 60;

/** Shows the month tabs as this member sees them. Follow with router.refresh(). */
export function startPreview(memberId: number): void {
  setCookie(String(memberId), PREVIEW_SECONDS);
}

/** Back to PA's own view. Follow with router.refresh(). */
export function stopPreview(): void {
  setCookie("", 0);
}

function setCookie(value: string, maxAge: number) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PREVIEW_COOKIE}=${value}; path=/; SameSite=Lax; max-age=${maxAge}${secure}`;
  channel()?.postMessage("changed");
}

// One channel per tab: a BroadcastChannel never hears its own messages, so only other tabs react.
let tabChannel: BroadcastChannel | null | undefined;
function channel(): BroadcastChannel | null {
  if (tabChannel === undefined) {
    tabChannel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(PREVIEW_COOKIE);
  }
  return tabChannel;
}

/** Calls `onChange` when another tab starts or ends a preview. Returns the unsubscribe. */
export function onPreviewChangedElsewhere(onChange: () => void): () => void {
  const c = channel();
  if (!c) return () => {};
  c.addEventListener("message", onChange);
  return () => c.removeEventListener("message", onChange);
}
