"use client";

import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-muted-foreground">
        If this keeps happening, the Supabase project may be paused. Restore it from the Supabase dashboard, then try
        again.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">Error ID: {error.digest}</p>}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
