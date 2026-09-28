import { Layers, Users } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/format";
import { formatPHP, sumCentavos } from "@/lib/money";
import type { Category, PeriodView } from "@/lib/periods";
import { cn } from "@/lib/utils";

// Sidebar on the Advances tab: shared advances by category, and each person's out-of-pocket.
export function AdvancesReport({ view }: { view: PeriodView }) {
  const byCategory = (Object.keys(CATEGORY_LABELS) as Category[]).map((category) => ({
    category,
    total: sumCentavos(view.advances.filter((a) => a.category === category).map((a) => a.amount)),
  }));
  const rowOf = new Map(view.rows.map((r) => [r.memberId, r]));

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5 shadow-xs">
        <h2 className="flex items-center justify-between font-semibold">
          Advances Shared Report
          <Layers className="size-4 text-muted-foreground" />
        </h2>
        <ul className="mt-3 divide-y text-sm">
          {byCategory.map(({ category, total }) => (
            <li key={category} className="flex items-center justify-between py-2">
              {CATEGORY_LABELS[category]}
              <span className="font-mono font-medium tabular-nums">{formatPHP(total)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between py-2 font-semibold">
            Total
            <span className="font-mono tabular-nums">{formatPHP(view.stats.sharedAdvances)}</span>
          </li>
        </ul>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-xs">
        <h2 className="flex items-center justify-between font-semibold">
          Out-of-Pocket by Person
          <Users className="size-4 text-muted-foreground" />
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">Advances plus bills each person paid (Own Advance in the Split Table).</p>
        <ul className="mt-3 divide-y text-sm">
          {view.members.map((m) => {
            const row = rowOf.get(m.id);
            return (
              <li key={m.id} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", m.dotClass)} aria-hidden />
                  {m.name}
                </span>
                <span className="font-mono font-medium tabular-nums">
                  {row ? formatPHP(row.ownAdvances + row.billsPaid) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
