"use client";

import { Check, ChevronDown, Eye, LogOut } from "lucide-react";
import { useState } from "react";
import { signOut } from "@/app/login/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePreviewBy, usePreviewSwitch, useViewer } from "@/components/viewer-context";
import { isAdmin } from "@/lib/permissions";
import type { PreviewChoice } from "@/lib/preview";
import { cn } from "@/lib/utils";

const ITEM =
  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none disabled:opacity-50";

/**
 * Who's signed in, as a chip styled like the header's stat cards: the member's colour dot and
 * name. It opens a small menu with a greeting, the login email, what they can do, and Sign out
 * — two clicks, so nobody signs out by accident. PA also gets "Preview as…" (lib/preview.ts):
 * the tabs then show what that housemate sees, and so does this chip.
 */
export function AccountMenu({
  dotClass,
  previewChoices,
}: {
  dotClass: string;
  /** Who PA can preview as; empty for everyone else. */
  previewChoices: PreviewChoice[];
}) {
  const viewer = useViewer();
  const previewBy = usePreviewBy();
  const admin = isAdmin(viewer);
  const [open, setOpen] = useState(false);
  const { pending, switchTo } = usePreviewSwitch();

  function preview(memberId: number | null) {
    setOpen(false);
    switchTo(memberId);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={previewBy ? `Account: previewing as ${viewer.name}` : `Account: signed in as ${viewer.name}`}
        className={cn(
          "flex min-h-11 items-center gap-2 self-stretch rounded-lg border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          previewBy
            ? "border-sky-300 bg-sky-50 hover:bg-sky-100 data-popup-open:bg-sky-100"
            : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 data-popup-open:bg-zinc-100",
        )}
      >
        {previewBy && <Eye className="size-4 text-sky-700" aria-hidden />}
        <span className={cn("size-2.5 shrink-0 rounded-full", dotClass)} aria-hidden />
        <span className="hidden max-w-32 truncate sm:inline">{viewer.name}</span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-0 p-0">
        <div className="space-y-1 p-3">
          <p className="font-semibold">Hi, {viewer.name}!</p>
          {viewer.email && <p className="truncate text-xs text-muted-foreground">{viewer.email}</p>}
          <p className="text-xs text-muted-foreground">
            {admin ? "Admin — you can change everything." : "You can log your own advances. The admin handles the rest."}
          </p>
        </div>
        {previewChoices.length > 0 && (
          <div className="border-t p-1">
            <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
              Preview as… <span className="font-normal">(see what they see)</span>
            </p>
            {previewChoices.map((m) => {
              const current = previewBy !== null && m.id === viewer.memberId;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={pending || current}
                  aria-current={current ? "true" : undefined}
                  onClick={() => preview(m.id)}
                  className={ITEM}
                >
                  <span className={cn("size-2.5 shrink-0 rounded-full", m.dotClass)} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {current && <Check className="size-4 text-muted-foreground" aria-hidden />}
                </button>
              );
            })}
            {previewBy && (
              <button type="button" disabled={pending} onClick={() => preview(null)} className={ITEM}>
                <Eye className="size-4 text-muted-foreground" aria-hidden />
                Exit preview (back to {previewBy.name})
              </button>
            )}
          </div>
        )}
        <form action={signOut} className="border-t p-1">
          <button type="submit" className={ITEM}>
            <LogOut className="size-4 text-muted-foreground" aria-hidden />
            Sign out
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
