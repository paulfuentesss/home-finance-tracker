"use client";

// Moves the launch screen (app/open/page.tsx) on to the app. An in-app navigation, so the launch
// screen stays up until the month is ready (or /login, when the proxy sends a signed-out visitor
// there); replace keeps it out of the back history. If it's still up after a while, a plain link
// offers a full reload.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const SLOW_MS = 15_000;

export function LaunchRedirect() {
  const router = useRouter();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    router.replace("/");
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [router]);

  if (!slow) return null;
  return (
    <p className="mt-6 text-sm text-muted-foreground">
      Taking longer than usual.{" "}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full reload, on purpose */}
      <a href="/" className="font-medium text-amber-700 underline underline-offset-4">
        Try again
      </a>
    </p>
  );
}
