import { Info } from "lucide-react";
import type { SidebarProps } from "@/components/app-sidebar";
import { SectionTitle } from "@/components/period-nav";
import type { PreviewChoice } from "@/lib/preview";
import { monthLabel } from "@/lib/format";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { formatPHP, type Centavos } from "@/lib/money";
import { isAdmin, type Viewer } from "@/lib/permissions";
import type { PeriodView } from "@/lib/periods";
import { cn } from "@/lib/utils";

/**
 * What the sidebar (components/app-sidebar.tsx) needs from the month. `viewer` is who the page
 * is drawn for: the signed-in member, or the housemate PA is previewing as (lib/preview.ts).
 * `previewChoices` is empty for everyone but PA. Only the viewer's dot colour leaves the server,
 * never a member row.
 */
export function sidebarProps(view: PeriodView, viewer: Viewer, previewChoices: PreviewChoice[]): SidebarProps {
  const { year, month, status } = view.period;
  return {
    base: `/periods/${year}/${month}`,
    periods: view.periods,
    current: { year, month },
    status,
    canStartNext: view.isLatest && isAdmin(viewer),
    waiting: view.payments.filter((p) => p.status === "pending").length,
    dotClass: [...view.members, ...previewChoices].find((m) => m.id === viewer.memberId)?.dotClass ?? "bg-zinc-400",
    previewChoices,
  };
}

// The top of every month page, beside the sidebar: the section's name on the left, the month's
// two headline totals on the right (under the name on phones).
export function PeriodHeader({ view }: { view: PeriodView }) {
  const { year, month } = view.period;
  const pendingBills = view.bills.filter((b) => b.status === "pending");

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4">
        <SectionTitle month={monthLabel(year, month)} />
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
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
        </div>
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
