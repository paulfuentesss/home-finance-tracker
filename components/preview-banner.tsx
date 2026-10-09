"use client";

import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreviewBy, usePreviewSwitch, useViewer } from "@/components/viewer-context";

/**
 * The strip above every month tab while PA previews as a housemate, so the preview is never
 * mistaken for PA's own view. Changes are refused on the server meanwhile (run() in actions.ts).
 */
export function PreviewBanner() {
  const viewer = useViewer();
  const previewBy = usePreviewBy();
  const { pending, switchTo } = usePreviewSwitch();
  if (!previewBy) return null;

  return (
    <div role="status" className="border-b border-sky-200 bg-sky-50 text-sky-900">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm">
        <Eye className="size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">
          Previewing as <span className="font-semibold">{viewer.name}</span>: this is what {viewer.name} sees.
          Changes are off.
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => switchTo(null)}
        >
          {pending ? "Exiting…" : "Exit preview"}
        </Button>
      </div>
    </div>
  );
}
