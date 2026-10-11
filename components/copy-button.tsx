"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Copies `value` to the clipboard, with a short "Copied" check. The copy happens right in the
 * click: Safari refuses one that waits for a fetch first (so a password is revealed before it
 * can be copied).
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState<boolean | "failed">(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={copied === true ? "Copied" : copied === "failed" ? "Couldn't copy" : `Copy ${label}`}
      title={copied === "failed" ? "Couldn't copy — select it and copy instead" : undefined}
      className="text-muted-foreground"
      onClick={() =>
        navigator.clipboard.writeText(value).then(
          () => setCopied(true),
          () => setCopied("failed"),
        )
      }
    >
      {copied === true ? <Check className="text-emerald-600" /> : <Copy />}
    </Button>
  );
}
