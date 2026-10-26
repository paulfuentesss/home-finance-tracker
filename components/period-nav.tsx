"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CalendarPlus,
  ChartColumn,
  HandCoins,
  KeyRound,
  Layers,
  Loader2,
  PhilippinePeso,
  ReceiptText,
  Settings,
  Sparkles,
  Undo2,
  Wallet,
} from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { startNextMonth } from "@/app/periods/[year]/[month]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { monthLabel, shortMonthLabel } from "@/lib/format";
import { useViewer } from "@/components/viewer-context";
import { isAdmin } from "@/lib/permissions";
import type { PeriodSummary } from "@/lib/periods";
import { cn } from "@/lib/utils";

// Each month's sections. `nav` is the sidebar's name for it; `label` is the full name, shown
// as the page title (and used in banner copy like "Fix it in Manage Columns & People").
// `adminOnly`: left out of housemates' sidebar (the page itself redirects anyone else).
const TABS: readonly {
  href: string;
  label: string;
  nav: string;
  group: "month" | "household";
  icon: typeof Layers;
  adminOnly?: boolean;
}[] = [
  { href: "", label: "Monthly Split Table", nav: "Split Table", group: "month", icon: Layers },
  { href: "/advances", label: "Advances Log & Report", nav: "Advances", group: "month", icon: PhilippinePeso },
  { href: "/helper", label: "Helper Visits", nav: "Helper Visits", group: "month", icon: Sparkles },
  { href: "/receipts", label: "Payment Proofs / Receipts", nav: "Receipts", group: "month", icon: ReceiptText },
  { href: "/settle", label: "Settle Up", nav: "Settle Up", group: "month", icon: HandCoins },
  { href: "/trends", label: "Spending Trends", nav: "Trends", group: "household", icon: ChartColumn },
  { href: "/billers", label: "Billers & Accounts", nav: "Billers & Accounts", group: "household", icon: KeyRound },
  { href: "/drawer", label: "Cash Drawer", nav: "Cash Drawer", group: "household", icon: Wallet, adminOnly: true },
  { href: "/manage", label: "Manage Columns & People", nav: "Manage", group: "household", icon: Settings, adminOnly: true },
];

const GROUPS = [
  { id: "month", label: "This month" },
  { id: "household", label: "Household" },
] as const;

/** The sidebar's link look, shared with the How it works link in components/app-sidebar.tsx. */
export const SIDEBAR_LINK =
  "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Menus that open from the sidebar (the month list, the account menu): dark like it, so they
 * read as part of it. Dialogs stay light — they belong to the page.
 */
export const SIDEBAR_POPUP = "bg-zinc-800 text-zinc-200 shadow-lg shadow-black/40 ring-white/10";

/** A menu row inside SIDEBAR_POPUP. */
export const SIDEBAR_POPUP_ITEM =
  "rounded-md transition-colors outline-none hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white";

/**
 * The part of the path after /periods/y/m, so switching months keeps the same tab. null off the
 * month pages (How it works), where no section is current and a month opens on its Split Table.
 */
function useTabSuffix(): string | null {
  const pathname = usePathname();
  const match = pathname.match(/^\/periods\/\d+\/\d+(\/.*)?$/);
  return match ? (match[1] ?? "") : null;
}

/** The section the page is on (undefined if the path isn't one of them). */
export function useCurrentTab() {
  const suffix = useTabSuffix();
  return TABS.find((t) => t.href === suffix);
}

/** The page title: the section's full name (the page's h1), with the month above it. */
export function SectionTitle({ month }: { month: string }) {
  const tab = useCurrentTab();
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-amber-700">{month}</p>
      <h1 className="text-xl font-semibold tracking-tight">{tab?.label ?? month}</h1>
    </div>
  );
}

/**
 * The month's two totals in the page header, left out on Trends (it covers several months, so
 * one month's totals beside it would read as its own) and the Cash Drawer (not about a month).
 */
export function MonthStatsSlot({ children }: { children: ReactNode }) {
  const href = useCurrentTab()?.href;
  return href === "/trends" || href === "/drawer" ? null : children;
}

/**
 * The sidebar's section links, in two groups. `waiting`: housemates' "I paid" waiting for PA —
 * shown as a count on Settle Up, for PA only. `onNavigate` lets the phone menu close itself,
 * even when the link is the page already open.
 */
export function SidebarNav({
  base,
  waiting = 0,
  onNavigate,
}: {
  base: string;
  waiting?: number;
  onNavigate?: () => void;
}) {
  const suffix = useTabSuffix();
  const admin = isAdmin(useViewer());
  // Manage and the Cash Drawer are PA's.
  const tabs = admin ? TABS : TABS.filter((t) => !t.adminOnly);
  return (
    <nav aria-label="Sections" className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group.id}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">{group.label}</p>
          <ul className="space-y-0.5">
            {tabs
              .filter((t) => t.group === group.id)
              .map(({ href, nav, icon: Icon }) => {
                const active = suffix === href;
                return (
                  <li key={href}>
                    <Link
                      href={`${base}${href}`}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        SIDEBAR_LINK,
                        active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", active && "text-amber-400")} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{nav}</span>
                      {href === "/settle" && admin && waiting > 0 && (
                        <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white tabular-nums">
                          {waiting}
                          <span className="sr-only"> waiting for you</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * "‹ August 2026 ›". The arrows only show when there's a month that way; clicking the month
 * name opens a list of every month that exists (newest first). Switching keeps the same tab.
 * On the latest month the list ends with "Start <next month>", which asks before creating it.
 * `sidebar`: a card on the dark sidebar, arrows at the edges. `bar`: plain, on the phone's top bar.
 */
export function MonthPicker({
  periods,
  current,
  canStartNext,
  variant = "bar",
}: {
  periods: PeriodSummary[];
  current: { year: number; month: number };
  canStartNext: boolean;
  variant?: "sidebar" | "bar";
}) {
  const dark = variant === "sidebar";
  const suffix = useTabSuffix();
  // The list stays open after tapping a month, its spinner showing while the month loads (the
  // current month stays on screen until then: there's no loading.tsx above the month layout). It
  // counts as open only for the month it was opened on, so it closes once the new month arrives.
  const here = `${current.year}-${current.month}`;
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === here;
  const setOpen = (next: boolean) => setOpenFor(next ? here : null);
  const [starting, setStarting] = useState(false);
  const upcoming =
    current.month === 12 ? { year: current.year + 1, month: 1 } : { year: current.year, month: current.month + 1 };
  const index = periods.findIndex((p) => p.year === current.year && p.month === current.month);
  const prev = index > 0 ? periods[index - 1] : undefined;
  const next = index !== -1 ? periods[index + 1] : undefined;
  const href = (p: PeriodSummary) => `/periods/${p.year}/${p.month}${suffix ?? ""}`;

  // On the dark sidebar the ghost buttons' light hover would flash; these keep it dark.
  const arrow = dark ? "text-zinc-300 hover:bg-white/10 hover:text-white aria-expanded:bg-white/10" : undefined;
  // On the sidebar card, an arrow's place stays when there's no month on that side (same size as an
  // arrow: `icon-sm`, larger on touch screens, components/ui/button.tsx). Not on the phone bar:
  // there the empty space made the arrow, name and ⇕ that do show look off-centre (on the newest
  // month, so most of the time); without it, what shows is centred.
  const gap = dark ? <span className="size-7 shrink-0 pointer-coarse:size-9" aria-hidden /> : null;

  return (
    <div
      className={cn(
        "flex items-center gap-1",
        dark && "justify-between rounded-lg bg-white/5 p-1 ring-1 ring-white/10",
      )}
    >
      {prev ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous month"
          nativeButton={false}
          className={arrow}
          render={<Link href={href(prev)} />}
        >
          <PendingIcon>
            <ChevronLeft />
          </PendingIcon>
        </Button>
      ) : (
        gap
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label="Choose month"
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-lg font-semibold tracking-tight whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            dark
              ? "min-w-0 px-2 py-1 text-sm text-white hover:bg-white/10 data-popup-open:bg-white/10"
              : "px-1.5 py-0.5 text-lg hover:bg-zinc-100 data-popup-open:bg-zinc-100",
          )}
        >
          {dark ? (
            <span className="truncate">{monthLabel(current.year, current.month)}</span>
          ) : (
            <>
              <span className="sm:hidden">{shortMonthLabel(current.year, current.month)}</span>
              <span className="hidden sm:inline">{monthLabel(current.year, current.month)}</span>
            </>
          )}
          <ChevronsUpDown className={cn("size-3.5 shrink-0", dark ? "text-zinc-400" : "text-muted-foreground")} aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="start" className={cn("w-48 gap-0 p-1", dark && SIDEBAR_POPUP)}>
          <ul>
            {periods.toReversed().map((p) => {
              const active = p.year === current.year && p.month === current.month;
              return (
                <li key={p.id}>
                  <Link
                    href={href(p)}
                    aria-current={active ? "page" : undefined}
                    // Another month closes the list when it arrives (see `openFor`).
                    onClick={active ? () => setOpen(false) : undefined}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors",
                      dark ? SIDEBAR_POPUP_ITEM : "hover:bg-zinc-100",
                      active && (dark ? "font-medium text-amber-400 hover:text-amber-300" : "font-medium text-amber-700"),
                    )}
                  >
                    {monthLabel(p.year, p.month)}
                    {active ? <Check className="size-4" /> : <PendingIcon />}
                  </Link>
                </li>
              );
            })}
          </ul>
          {canStartNext && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setStarting(true);
              }}
              className={cn(
                "mt-1 flex w-full items-center gap-2 rounded-md border-t px-2.5 pt-2 pb-1.5 text-left text-sm transition-colors",
                dark
                  ? cn(SIDEBAR_POPUP_ITEM, "border-white/10 text-zinc-400")
                  : "text-muted-foreground hover:bg-zinc-100 hover:text-foreground",
              )}
            >
              <CalendarPlus className="size-4" />
              Start {monthLabel(upcoming.year, upcoming.month)}
            </button>
          )}
        </PopoverContent>
      </Popover>
      {canStartNext && (
        <StartNextMonthDialog
          label={monthLabel(upcoming.year, upcoming.month)}
          open={starting}
          onOpenChange={setStarting}
        />
      )}
      {next ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next month"
          nativeButton={false}
          className={arrow}
          render={<Link href={href(next)} />}
        >
          <PendingIcon>
            <ChevronRight />
          </PendingIcon>
        </Button>
      ) : (
        gap
      )}
    </div>
  );
}

/**
 * "↩ Back to October 2026" under the month picker, only on an older month: the newest month, on
 * the same tab (like the arrows). Nothing on the newest month itself. `sidebar` / `bar` as in
 * MonthPicker.
 */
export function BackToLatest({
  periods,
  current,
  variant = "bar",
}: {
  periods: PeriodSummary[];
  current: { year: number; month: number };
  variant?: "sidebar" | "bar";
}) {
  const suffix = useTabSuffix();
  const latest = periods.at(-1);
  if (!latest || (latest.year === current.year && latest.month === current.month)) return null;
  return (
    <Link
      href={`/periods/${latest.year}/${latest.month}${suffix ?? ""}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        variant === "sidebar"
          ? "text-amber-400 hover:bg-white/5 hover:text-amber-300"
          : "text-amber-700 hover:bg-zinc-100",
      )}
    >
      <PendingIcon>
        <Undo2 className="size-4" aria-hidden />
      </PendingIcon>
      Back to {monthLabel(latest.year, latest.month)}
    </Link>
  );
}

/**
 * Inside a month link: a spinner while that month loads, otherwise `children` (an arrow, or
 * nothing in the month list). A month switch keeps the current month on screen until the new one
 * is ready, so this is what shows the tap was taken.
 */
function PendingIcon({ children = null }: { children?: ReactNode }) {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : children;
}

function StartNextMonthDialog({
  label,
  open,
  onOpenChange,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        setError(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start {label}?</DialogTitle>
          <DialogDescription>
            Creates {label} with the same bill columns (at ₱0, ready for the new amounts), the same split modes and
            points, and everyone currently in the household. Unpaid balances carry over.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await startNextMonth();
                if (result?.ok) {
                  // Stays open on "Starting…" until the new month is on screen (its page replaces
                  // this one, dialog included).
                  if (result.redirectTo) router.push(result.redirectTo);
                  else onOpenChange(false);
                } else if (result) setError(result.error);
              })
            }
          >
            {pending ? "Starting…" : `Start ${label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
