"use client";

import { WifiOff } from "lucide-react";
import { useOffline } from "next/offline";

/**
 * The strip at the top of every signed-in page while there's no connection (docs/features/offline.md).
 * `useOffline` (experimental.useOffline in next.config.ts) turns on when the browser says it's offline
 * or a save or page fetch fails for lack of a network, and off once Next reaches the site again.
 * Meanwhile saves wait and go through by themselves, so the page has to stay open.
 */
export function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;

  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2 text-sm">
        <WifiOff className="size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">No connection.</span> You can keep looking. Anything you save goes through
          once you&apos;re back online — keep My House open until then.
        </p>
      </div>
    </div>
  );
}
