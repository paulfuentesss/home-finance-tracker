"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useViewer } from "@/components/viewer-context";
import { isAdmin } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * Who's signed in, as a chip styled like the header's stat cards: the member's colour dot and
 * name. It opens a small menu with a greeting, the login email, what they can do, and Sign out
 * — two clicks, so nobody signs out by accident.
 */
export function AccountMenu({ dotClass }: { dotClass: string }) {
  const viewer = useViewer();
  const admin = isAdmin(viewer);

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Account: signed in as ${viewer.name}`}
        className="flex min-h-11 items-center gap-2 self-stretch rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium transition-colors outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-zinc-100"
      >
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
        <form action={signOut} className="border-t p-1">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none"
          >
            <LogOut className="size-4 text-muted-foreground" aria-hidden />
            Sign out
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
