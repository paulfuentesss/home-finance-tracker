import { ChevronLeft, ChevronRight, DollarSign, FileText, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdvancesLog } from "@/components/advances-log";
import { AddBillDialog } from "@/components/entry-dialogs";
import { Panel, PanelBar, PanelHeading } from "@/components/panel";
import { SettlementMatrix } from "@/components/settlement-matrix";
import { monthLabel } from "@/lib/format";
import { getPeriodView, type PeriodSummary } from "@/lib/periods";
import { cn } from "@/lib/utils";

type Props = PageProps<"/periods/[year]/[month]">;

async function parseParams(params: Props["params"]) {
  const { year, month } = await params;
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) notFound();
  return { year: y, month: m };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year, month } = await parseParams(params);
  return { title: monthLabel(year, month) };
}

export default async function PeriodPage({ params }: Props) {
  const { year, month } = await parseParams(params);
  const view = await getPeriodView(year, month);
  if (!view) notFound();

  const open = view.period.status === "open";

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-white">
            <DollarSign className="size-10 rounded-xl border border-emerald-500/30 bg-emerald-950/50 p-2 text-emerald-400" />
            Household Finance Tracker
          </h1>
          <p className="mt-1 text-slate-400">{monthLabel(year, month)} Settlement Matrix &amp; Shared Expense Log</p>
        </div>

        <nav aria-label="Months" className="flex items-center gap-2">
          <PeriodLink period={view.prev} direction="prev" />
          <span className="min-w-32 text-center text-sm font-semibold text-slate-200">{monthLabel(year, month)}</span>
          <PeriodLink period={view.next} direction="next" />
          <span
            className={cn(
              "ml-1 rounded-full border px-2 py-0.5 text-xs",
              open
                ? "border-emerald-500/30 bg-emerald-950/50 text-emerald-400"
                : "border-slate-600 bg-slate-700 text-slate-300",
            )}
          >
            {open ? "Open" : "Closed"}
          </span>
        </nav>
      </header>

      {/* Matrix */}
      <Panel>
        <PanelBar>
          <PanelHeading title="Monthly Settlement Breakdown" icon={<Users className="size-5 text-amber-400" />} />
          {open && <AddBillDialog view={view} />}
        </PanelBar>
        <SettlementMatrix view={view} />
      </Panel>

      {/* Advances log */}
      <Panel padded>
        <AdvancesLog
          view={view}
          heading={
            <PanelHeading
              title="Shared Advances Log"
              description="Logged expenses paid by individual members for the household"
              icon={<FileText className="size-5 text-indigo-400" />}
              size="lg"
            />
          }
        />
      </Panel>
    </div>
  );
}

function PeriodLink({ period, direction }: { period: PeriodSummary | null; direction: "prev" | "next" }) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const className =
    "inline-flex size-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 transition-colors hover:bg-slate-700";
  if (!period) {
    return (
      <span className={cn(className, "pointer-events-none opacity-30")} aria-hidden>
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <Link
      href={`/periods/${period.year}/${period.month}`}
      className={className}
      aria-label={`${direction === "prev" ? "Previous" : "Next"} month: ${monthLabel(period.year, period.month)}`}
    >
      <Icon className="size-4" />
    </Link>
  );
}
