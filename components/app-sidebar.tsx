"use client";

import { CircleHelp, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { AccountMenu } from "@/components/account-menu";
import { HouseBadge } from "@/components/house-badge";
import { NotificationsCard } from "@/components/notifications";
import { OfflineBanner } from "@/components/offline-banner";
import { BackToLatest, MonthPicker, SIDEBAR_LINK, SidebarNav } from "@/components/period-nav";
import { PreviewBanner } from "@/components/preview-banner";
import { SeenTracker } from "@/components/seen-tracker";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ViewerProvider } from "@/components/viewer-context";
import { IGNORED, moveEdgeSwipe, startEdgeSwipe, type EdgeSwipe, type SwipePoint } from "@/lib/edge-swipe";
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
 * The dark sidebar on every month page: My House, the month switcher (with "Back to <newest
 * month>" under it on an older month), the sections, How it
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

      <div className="space-y-1">
        <MonthPicker periods={periods} current={current} canStartNext={canStartNext} variant="sidebar" />
        {/* No onNavigate: like a month in the picker, the phone menu stays open with the spinner
            and closes once the month arrives. */}
        <BackToLatest periods={periods} current={current} variant="sidebar" />
      </div>

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
 * sidebar, the phone's top bar, the No connection and preview strips, then the page. `viewer` is who the page is
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
  const pageRef = useRef<HTMLDivElement>(null);
  return (
    <ViewerProvider viewer={viewer} previewBy={previewBy}>
      <div className="flex min-h-dvh">
        <DesktopSidebar {...sidebar} />
        {/* min-w-0 lets this column shrink below its widest table, so wide tables scroll inside
            their own box instead of pushing the page sideways. */}
        <div ref={pageRef} className="min-w-0 flex-1">
          {/* One sticky box, so the No connection strip stays in view under the phone's top bar
              (lg:hidden: on desktop the box holds just the strip). */}
          <div className="sticky top-0 z-30">
            <MobileTopBar {...sidebar} pageRef={pageRef} />
            <OfflineBanner />
          </div>
          <PreviewBanner />
          {children}
        </div>
      </div>
      {/* Notes who's using My House, app or browser, for the admin's Manage page. */}
      <SeenTracker />
      {/* Inside the installed app: a one-time "Turn on notifications" card, and keeping them in sync. */}
      <NotificationsCard />
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
 * Phones and tablets: a slim bar with ☰, the month in the middle and the house on the right
 * (on an older month, "Back to <newest month>" under them).
 * ☰, or a swipe in from the left edge of the page, slides the sidebar in; dragging it back
 * left closes it (components/ui/sheet.tsx).
 * The menu remembers the page it was opened on and counts as open only there, so moving to
 * any other page (a section, a month, How it works) closes it without an effect. Tapping the
 * page you're already on closes it through `onNavigate`.
 */
function MobileTopBar({ pageRef, ...props }: SidebarProps & { pageRef: RefObject<HTMLDivElement | null> }) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  useEdgeSwipe(
    pageRef,
    useCallback(() => setOpenOn(pathname), [pathname]),
  );

  return (
    // Three columns, the outer two equal, so the month sits in the middle of the bar. px-4 matches
    // the page below (period-header.tsx, the month layout's <main>), so ☰ and the house line up with it.
    <div className="sticky top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b bg-white px-4 py-2 lg:hidden">
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
      {/* A second row, only on an older month: empty:hidden keeps the bar unchanged otherwise. */}
      <div className="col-span-3 -mt-1 justify-self-center empty:hidden">
        <BackToLatest periods={props.periods} current={props.current} />
      </div>
    </div>
  );
}

/**
 * Calls `onSwipe` when a finger swipes right from near the left edge of `pageRef`
 * (lib/edge-swipe.ts decides). Passive listeners, so taps and scrolling are untouched. They're
 * native, not React's, so dialogs and menus (portalled to <body>) never set it off.
 */
function useEdgeSwipe(pageRef: RefObject<HTMLElement | null>, onSwipe: () => void) {
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    // Tailwind's lg, where the sidebar sits beside the page.
    const desktop = window.matchMedia("(min-width: 64rem)");
    let swipe: EdgeSwipe = IGNORED;
    const at = (event: TouchEvent): SwipePoint => ({
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      t: event.timeStamp,
    });

    const onStart = (event: TouchEvent) => {
      swipe =
        event.touches.length === 1 && !desktop.matches && !keepsSwipe(event.target, page)
          ? startEdgeSwipe(at(event))
          : IGNORED;
    };
    const onMove = (event: TouchEvent) => {
      if (swipe.phase !== "pending") return;
      swipe = event.touches.length === 1 ? moveEdgeSwipe(swipe, at(event)) : IGNORED;
      if (swipe.phase === "open") onSwipe();
    };
    const onEnd = () => {
      swipe = IGNORED;
    };

    const passive = { passive: true };
    page.addEventListener("touchstart", onStart, passive);
    page.addEventListener("touchmove", onMove, passive);
    page.addEventListener("touchend", onEnd, passive);
    page.addEventListener("touchcancel", onEnd, passive);
    return () => {
      page.removeEventListener("touchstart", onStart);
      page.removeEventListener("touchmove", onMove);
      page.removeEventListener("touchend", onEnd);
      page.removeEventListener("touchcancel", onEnd);
    };
  }, [pageRef, onSwipe]);
}

/**
 * Whether the touch belongs to what's under it: a box being typed in (dragging selects text), or
 * something scrolled sideways (a wide table), which a swipe right scrolls back.
 */
function keepsSwipe(target: EventTarget | null, page: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable]")) return true;
  for (let node: Element | null = target; node && node !== page; node = node.parentElement) {
    if (node.scrollLeft > 0) return true;
  }
  return false;
}
