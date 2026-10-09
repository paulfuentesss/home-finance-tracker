import { CircleHelp, Info } from "lucide-react";
import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { HouseBadge } from "@/components/house-badge";
import { MonthPicker, TabNav } from "@/components/period-nav";
import { monthLabel } from "@/lib/format";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { formatPHP, type Centavos } from "@/lib/money";
import { isAdmin, type Viewer } from "@/lib/permissions";
import type { PeriodView } from "@/lib/periods";
import { cn } from "@/lib/utils";

// The top of every month tab: the month on the left, its two headline totals on the right, then the tabs.
export function PeriodHeader({ view, viewer }: { view: PeriodView; viewer: Viewer }) {
  const { year, month, status } = view.period;
  const base = `/periods/${year}/${month}`;
  const pendingBills = view.bills.filter((b) => b.status === "pending");

  return (
    <header className="border-b bg-white">
      {/* The month is shown inside the month picker button, so screen readers get it as the page heading here. */}
      <h1 className="sr-only">{monthLabel(year, month)}</h1>
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <HouseBadge />
          <div>
            <p className="px-1.5 text-sm font-semibold text-amber-700">My House</p>
            <div className="flex items-center gap-2">
              <MonthPicker periods={view.periods} current={{ year, month }} canStartNext={view.isLatest && isAdmin(viewer)} />
              {/* Open is the normal state, so only a locked month gets a badge. */}
              {status === "closed" && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">Closed</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* A popover like the stat cards' (hover or tap), with the link inside — a tooltip
              never shows on a phone. */}
          <Popover>
            <PopoverTrigger
              openOnHover
              aria-label="How it works"
              className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-zinc-100 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-zinc-100 data-popup-open:text-foreground"
            >
              <CircleHelp className="size-5" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64">
              <div>
                <PopoverTitle>How it works</PopoverTitle>
                <PopoverDescription className="text-xs">
                  How bills and advances are split, what Month Final and Final mean, settling up, and who can
                  change what.
                </PopoverDescription>
              </div>
              <Link
                href="/how-it-works"
                className="text-xs font-medium text-amber-700 underline-offset-2 hover:underline"
              >
                Read how it works →
              </Link>
            </PopoverContent>
          </Popover>
          <Stat
            label="Total core bills"
            value={view.stats.coreBills}
            description="The bill columns of the split table, confirmed bills only."
            lines={view.bills.filter((b) => b.status === "confirmed").map((b) => ({ id: b.id, label: b.name, amount: b.total }))}
            note={
              pendingBills.length > 0
                ? `Not counted until confirmed: ${pendingBills.map((b) => b.name).join(", ")}.`
                : undefined
            }
          />
          <Stat
            label="Shared advances"
            value={view.stats.sharedAdvances}
            description="Every advance logged this month, by the shared column it goes into."
            lines={view.columns.map((c) => ({ id: c.id, label: c.name, amount: c.total }))}
            accent
          />
          <AccountMenu
            dotClass={view.members.find((m) => m.id === viewer.memberId)?.dotClass ?? "bg-zinc-400"}
          />
        </div>
      </div>
      <div className="mx-auto w-full max-w-7xl px-4">
        <TabNav base={base} />
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  description,
  lines,
  note,
  accent = false,
}: {
  label: string;
  value: Centavos;
  description: string;
  lines: { id: number; label: string; amount: Centavos }[];
  note?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-1.5",
        accent ? "border-amber-200 bg-amber-50 text-amber-900" : "border-zinc-200 bg-zinc-50",
      )}
    >
      <div className={cn("flex items-center gap-1 text-xs", accent ? "text-amber-700" : "text-muted-foreground")}>
        {label}
        <Popover>
          <PopoverTrigger
            openOnHover
            aria-label={`What's in ${label.toLowerCase()}`}
            className="rounded-full opacity-70 transition-opacity outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64">
            <div>
              <PopoverTitle>{label}</PopoverTitle>
              <PopoverDescription className="text-xs">{description}</PopoverDescription>
            </div>
            <ul className="divide-y text-xs">
              {lines.map((line) => (
                <li key={line.id} className="flex justify-between gap-3 py-1.5">
                  <span>{line.label}</span>
                  <span className="font-mono tabular-nums">{formatPHP(line.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3 py-1.5 font-semibold">
                <span>Total</span>
                <span className="font-mono tabular-nums">{formatPHP(value)}</span>
              </li>
            </ul>
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
          </PopoverContent>
        </Popover>
      </div>
      <div className="font-mono text-sm font-semibold tabular-nums">{formatPHP(value)}</div>
    </div>
  );
}
