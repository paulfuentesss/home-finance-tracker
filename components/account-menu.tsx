"use client";

import { Check, ChevronsUpDown, Download, Eye, LogOut } from "lucide-react";
import { startTransition, useState } from "react";
import { signOut } from "@/app/login/actions";
import { updateMemberEmoji } from "@/app/periods/[year]/[month]/actions";
import { InlineInput } from "@/components/inline-input";
import { openInstallCard, useShowInstallItem } from "@/components/install-prompt";
import { MemberMark } from "@/components/member-mark";
import { forgetThisDevice, NotificationsMenuItem } from "@/components/notifications";
import { MAX_EMOJI_LENGTH } from "@/lib/members";
import { SIDEBAR_POPUP, SIDEBAR_POPUP_ITEM } from "@/components/period-nav";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePreviewBy, usePreviewSwitch, useViewer } from "@/components/viewer-context";
import { isAdmin, isViewOnly } from "@/lib/permissions";
import type { PreviewChoice } from "@/lib/preview";
import { cn } from "@/lib/utils";

const ITEM = cn(
  SIDEBAR_POPUP_ITEM,
  "flex w-full items-center gap-2 px-2 py-2 text-left text-sm disabled:opacity-50 disabled:hover:bg-transparent",
);

/**
 * Who's signed in, as the row at the bottom of the sidebar: the member's emoji (or colour dot)
 * and name. It opens a small menu with a greeting, the login email, what they can do, their own
 * emoji to change (not for view-only logins), notifications on this device
 * (components/notifications.tsx), and Sign out — two clicks, so nobody signs out by accident. PA also gets "Preview as…" (lib/preview.ts):
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
  const showInstall = useShowInstallItem();
  const [signingOut, setSigningOut] = useState(false);

  function preview(memberId: number | null) {
    setOpen(false);
    switchTo(memberId);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={previewBy ? `Account: previewing as ${viewer.name}` : `Account: signed in as ${viewer.name}`}
        className={cn(
          "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          previewBy
            ? "bg-sky-400/15 text-sky-100 ring-1 ring-sky-400/40 hover:bg-sky-400/25 data-popup-open:bg-sky-400/25"
            : "text-zinc-200 hover:bg-white/5 data-popup-open:bg-white/10",
        )}
      >
        {previewBy && <Eye className="size-4 shrink-0 text-sky-300" aria-hidden />}
        <MemberMark dotClass={dotClass} emoji={viewer.emoji} className="size-7 text-xl" />
        <span className="min-w-0 flex-1 truncate">{viewer.name}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-zinc-500" aria-hidden />
      </PopoverTrigger>
      {/* Exactly as wide as the account row above it, so it never hangs over the page. */}
      <PopoverContent side="top" align="start" className={cn("w-(--anchor-width) gap-0 p-0", SIDEBAR_POPUP)}>
        <div className="space-y-1 p-3">
          <p className="font-semibold text-white">Hi, {viewer.name}!</p>
          {viewer.email && <p className="truncate text-xs text-zinc-400">{viewer.email}</p>}
          <p className="text-xs text-zinc-400">
            {admin
              ? "Admin — you can change everything."
              : isViewOnly(viewer)
                ? "View only — you can see every month, but not change anything."
                : "You can log your own advances. The admin handles the rest."}
          </p>
          {/* Your own emoji (updateMemberEmoji). Not for a view-only login, who changes nothing,
              nor while previewing: it would be the housemate's, and saving is refused then. */}
          {!isViewOnly(viewer) && !previewBy && (
            <div className="flex items-center gap-2 pt-2 text-xs text-zinc-400">
              Your emoji
              <InlineInput
                action={updateMemberEmoji}
                hidden={{ memberId: viewer.memberId }}
                name="emoji"
                value={viewer.emoji ?? ""}
                label="Your emoji"
                maxLength={MAX_EMOJI_LENGTH}
                inputClassName="w-12 border-white/15 bg-zinc-800 px-2 py-1 text-center text-base text-white"
              />
            </div>
          )}
        </div>
        {previewChoices.length > 0 && (
          <div className="border-t border-white/10 p-1">
            <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-zinc-400">
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
                  <MemberMark dotClass={m.dotClass} emoji={m.emoji} />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {current && <Check className="size-4 text-zinc-400" aria-hidden />}
                </button>
              );
            })}
            {previewBy && (
              <button type="button" disabled={pending} onClick={() => preview(null)} className={ITEM}>
                <Eye className="size-4 text-zinc-400" aria-hidden />
                Exit preview (back to {previewBy.name})
              </button>
            )}
          </div>
        )}
        {showInstall && (
          // Brings back the install card (components/install-prompt.tsx), even after "Not now".
          <div className="border-t border-white/10 p-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openInstallCard();
              }}
              className={ITEM}
            >
              <Download className="size-4 text-zinc-400" aria-hidden />
              Install app
            </button>
          </div>
        )}
        <NotificationsMenuItem itemClass={ITEM} />
        <form
          className="border-t border-white/10 p-1"
          onSubmit={(event) => {
            event.preventDefault();
            // This device's notifications stop first (at most ~2 s), so the next person signed in
            // here doesn't get them; signing out goes ahead whatever happens.
            setSigningOut(true);
            startTransition(async () => {
              await forgetThisDevice();
              try {
                await signOut(); // redirects to /login
              } catch (error) {
                setSigningOut(false);
                throw error;
              }
            });
          }}
        >
          <button type="submit" disabled={signingOut} className={ITEM}>
            <LogOut className="size-4 text-zinc-400" aria-hidden />
            Sign out
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
