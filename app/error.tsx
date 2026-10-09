"use client";

import { MessagePage } from "@/components/message-page";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
