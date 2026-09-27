import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdvancesLog } from "@/components/advances-log";
import { AddAdvanceDialog, AddBillDialog } from "@/components/entry-dialogs";
import { SettlementMatrix } from "@/components/settlement-matrix";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
    <div className="space-y-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <PeriodLink period={view.prev} direction="prev" />
          <h1 className="text-2xl font-semibold tracking-tight">{monthLabel(year, month)}</h1>
          <PeriodLink period={view.next} direction="next" />
          <Badge variant={open ? "secondary" : "outline"}>{open ? "Open" : "Closed"}</Badge>
        </div>
      </header>

      <section className="space-y-4" aria-labelledby="settlement-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="settlement-heading" className="text-lg font-semibold">
              Settlement
            </h2>
            <p className="text-sm text-muted-foreground">
              Bill shares + shared advances − what each person advanced. Edit a bill total and press Enter to re-split it.
            </p>
          </div>
          {open && <AddBillDialog view={view} />}
        </div>
        <SettlementMatrix view={view} />
      </section>

      <section className="space-y-4" aria-labelledby="advances-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="advances-heading" className="text-lg font-semibold">
              Shared advances
            </h2>
            <p className="text-sm text-muted-foreground">Household purchases members paid for themselves.</p>
          </div>
          {open && <AddAdvanceDialog view={view} />}
        </div>
        <AdvancesLog view={view} />
      </section>
    </div>
  );
}

function PeriodLink({ period, direction }: { period: PeriodSummary | null; direction: "prev" | "next" }) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const label = direction === "prev" ? "Previous month" : "Next month";
  const className = cn(buttonVariants({ variant: "ghost", size: "icon" }));
  if (!period) {
    return (
      <span className={cn(className, "pointer-events-none opacity-30")} aria-hidden>
        <Icon />
      </span>
    );
  }
  return (
    <Link href={`/periods/${period.year}/${period.month}`} className={className} aria-label={label}>
      <Icon />
    </Link>
  );
}
