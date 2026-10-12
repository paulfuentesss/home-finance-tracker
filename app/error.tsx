"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { MessagePage } from "@/components/message-page";
import { Button } from "@/components/ui/button";

/**
 * A page left open across a deploy saved through the old version's actions, which the new one
 * doesn't have. Only a full reload fixes it: `reset()` would draw the same old page again.
 * A plain boolean: Next's type guard would narrow `error` to `never` below.
 */
function isFromOldVersion(error: unknown): boolean {
  return unstable_isUnrecognizedActionError(error);
}

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  if (isFromOldVersion(error)) {
    return (
      <MessagePage title="My House was updated">
        <title>My House was updated · My House</title>
        <p className="text-sm text-muted-foreground">Reload to get the new version, then try that again.</p>
        <Button onClick={() => window.location.reload()} className="w-full">
          Reload
        </Button>
      </MessagePage>
    );
  }

  return (
    <MessagePage title="Something went wrong">
      {/* An error page can't export metadata (it's a Client Component); React puts this in <head>. */}
      <title>Something went wrong · My House</title>
      <p className="text-sm text-muted-foreground">Try again in a moment. If it keeps happening, let the admin know.</p>
      <p className="text-xs text-muted-foreground">
        For the admin: the Supabase project may be paused. Restore it from the Supabase dashboard, then try again.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">Error ID: {error.digest}</p>}
      <Button onClick={reset} className="w-full">
        Try again
      </Button>
    </MessagePage>
  );
}
