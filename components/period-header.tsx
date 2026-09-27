import { CircleHelp, FileText } from "lucide-react";
import Link from "next/link";
import { MonthPicker, RefreshButton, StartNextMonthButton, TabNav } from "@/components/period-nav";
import { formatPHP } from "@/lib/money";
import type { PeriodView } from "@/lib/periods";
import { cn } from "@/lib/utils";

// The top of every month tab: month + status, the two headline totals, and the tabs.
export function PeriodHeader({ view }: { view: PeriodView }) {
  const { year, month, status } = view.period;
  const base = `/periods/${year}/${month}`;

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600">
            <FileText className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <MonthPicker periods={view.periods} current={{ year, month }} />
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  status === "open" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600",
                )}
              >
                {status === "open" ? "Open" : "Closed"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Household expense &amp; split tracker</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Stat label="Total core bills" value={formatPHP(view.stats.coreBills)} />
          <Stat label="Shared advances" value={formatPHP(view.stats.sharedAdvances)} accent />
          <RefreshButton />
          <Link
            href="/how-it-works"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-zinc-100 hover:text-foreground"
          >
            <CircleHelp className="size-4" />
            How it works
          </Link>
          {view.isLatest && <StartNextMonthButton />}
        </div>
      </div>
      <div className="mx-auto w-full max-w-7xl px-4">
        <TabNav base={base} />
      </div>
    </header>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-1.5",
        accent ? "border-amber-200 bg-amber-50 text-amber-900" : "border-zinc-200 bg-zinc-50",
      )}
    >
      <div className={cn("text-xs", accent ? "text-amber-700" : "text-muted-foreground")}>{label}</div>
      <div className="font-mono text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
