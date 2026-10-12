"use client";

import { CircleHelp, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AccountMenu } from "@/components/account-menu";
import { HouseBadge } from "@/components/house-badge";
import { MonthPicker, SIDEBAR_LINK, SidebarNav } from "@/components/period-nav";
import { PreviewBanner } from "@/components/preview-banner";
import { SeenTracker } from "@/components/seen-tracker";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ViewerProvider } from "@/components/viewer-context";
import type { Viewer } from "@/lib/permissions";
import type { PeriodSummary } from "@/lib/periods";
import type { PreviewChoice } from "@/lib/preview";
import { cn } from "@/lib/utils";

/** The My House logo's link: home, the newest month's Split Table. */
const HOME_LABEL = "My House: this month's Split Table";

export type SidebarProps = {
  base: string;
  periods: PeriodSummary[];
  current: { year: number; month: number };
  status: "open" | "closed";
  canStartNext: boolean;
  /** Housemates' "I paid" waiting for PA (the count on Settle Up). */
  waiting: number;
  dotClass: string;
  previewChoices: PreviewChoice[];
};

/**
 * The dark sidebar on every month page: My House, the month switcher, the sections, How it
 * works, and the account at the bottom. Desktop shows it beside the page; phones open the same
 * thing from the ☰ in the top bar.
 */
function SidebarContent({
  base,
  periods,
  current,
  status,
  canStartNext,
  waiting,
  dotClass,
  previewChoices,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  const onHelp = usePathname() === "/how-it-works";
  return (
    <div className="flex min-h-full grow flex-col gap-5 bg-zinc-900 px-3 py-4 text-zinc-300">
      <div className="flex items-center gap-3 px-1">
        {/* Home: "/" opens the newest month's Split Table (app/page.tsx), from any month or page.
            Only the house icon is the link; the name beside it is plain text. */}
        <Link
          href="/"
          onClick={onNavigate}
          aria-label={HOME_LABEL}
          className="rounded-xl transition outline-none hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HouseBadge dark />
        </Link>
        <p className="flex items-center gap-2 font-semibold text-white">
          My House
          {/* Open is the normal state, so only a locked month gets a badge. */}
          {status === "closed" && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-zinc-300">Closed</span>
          )}
        </p>
      </div>

      <MonthPicker periods={periods} current={current} canStartNext={canStartNext} variant="sidebar" />

      <SidebarNav base={base} waiting={waiting} onNavigate={onNavigate} />

      <div>
        <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Help</p>
        <Link
          href="/how-it-works"
          onClick={onNavigate}
          aria-current={onHelp ? "page" : undefined}
          className={cn(
            SIDEBAR_LINK,
            onHelp ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white",
          )}
        >
          <CircleHelp className={cn("size-4 shrink-0", onHelp && "text-amber-400")} aria-hidden />
          How it works
        </Link>
      </div>

      <div className="mt-auto border-t border-white/10 pt-3">
        <AccountMenu dotClass={dotClass} previewChoices={previewChoices} />
      </div>
    </div>
  );
}

/**
 * The frame around every signed-in page with the sidebar (the month pages, How it works): the
 * sidebar, the phone's top bar, the preview strip, then the page. `viewer` is who the page is
 * drawn for (lib/preview.ts); the pages below read it from the context.
 */
export function AppShell({
  viewer,
  previewBy,
  sidebar,
  children,
}: {
  viewer: Viewer;
  previewBy: Viewer | null;
  sidebar: SidebarProps;
  children: ReactNode;
}) {
  return (
    <ViewerProvider viewer={viewer} previewBy={previewBy}>
      <div className="flex min-h-dvh">
        <DesktopSidebar {...sidebar} />
        {/* min-w-0 lets this column shrink below its widest table, so wide tables scroll inside
            their own box instead of pushing the page sideways. */}
        <div className="min-w-0 flex-1">
          <MobileTopBar {...sidebar} />
          <PreviewBanner />
          {children}
        </div>
      </div>
      {/* Notes who's using My House, app or browser, for the admin's Manage page. */}
      <SeenTracker />
    </ViewerProvider>
  );
}

/** Desktop: the sidebar stays beside the page and doesn't scroll with it. */
function DesktopSidebar(props: SidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 overflow-y-auto bg-zinc-900 lg:block">
      <SidebarContent {...props} />
    </aside>
  );
}

/**
 * Phones and tablets: a slim bar with ☰, the month in the middle and the house on the right.
 * ☰ slides the sidebar in.
 * The menu remembers the page it was opened on and counts as open only there, so moving to
 * any other page (a section, a month, How it works) closes it without an effect. Tapping the
 * page you're already on closes it through `onNavigate`.
 */
function MobileTopBar(props: SidebarProps) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    // Three columns, the outer two equal, so the month sits in the middle of the bar.
    <div className="sticky top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b bg-white px-2 py-2 lg:hidden">
      <Sheet open={open} onOpenChange={(next) => setOpenOn(next ? pathname : null)}>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Open menu"
          className="justify-self-start"
          onClick={() => setOpenOn(pathname)}
        >
          <Menu className="size-5" />
        </Button>
        {/* The menu is portalled to <body>, outside this bar's lg:hidden, so it hides itself on desktop too. */}
        <SheetContent className="overflow-y-auto bg-zinc-900 lg:hidden" overlayClassName="lg:hidden">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-5 right-3 text-zinc-400 hover:bg-white/10 hover:text-white"
              />
            }
          >
            <X />
            <span className="sr-only">Close menu</span>
          </SheetClose>
          <SidebarContent {...props} onNavigate={() => setOpenOn(null)} />
        </SheetContent>
      </Sheet>
      <MonthPicker periods={props.periods} current={props.current} canStartNext={props.canStartNext} />
      <Link
        href="/"
        aria-label={HOME_LABEL}
        className="justify-self-end rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <HouseBadge />
      </Link>
    </div>
  );
}
