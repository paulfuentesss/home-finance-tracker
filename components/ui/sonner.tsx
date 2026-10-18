"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * The toasts ("Advance logged") after a dialog saves (useDialogForm in components/entry-dialogs.tsx).
 * Sonner announces each one to screen readers (a polite live region). Top centre, so they never
 * sit on the install or notifications prompts at the bottom; light only, like the rest of the app.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-center"
      duration={3000}
      icons={{
        success: <CircleCheck className="size-4 text-emerald-600" aria-hidden />,
        error: <CircleX className="size-4 text-destructive" aria-hidden />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
