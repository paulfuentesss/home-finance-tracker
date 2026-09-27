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
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-xs">
        <h2 className="flex items-center gap-2 font-semibold">
          <Layers className="size-4 text-emerald-600" />
          Advances Shared Report
        </h2>
        <table className="mt-4 w-full overflow-hidden rounded-lg bg-white text-sm">
          <thead className="bg-emerald-50 text-left text-emerald-900">
            <tr>
              <th className="px-3 py-2 font-semibold">Category</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {byCategory.map(({ category, total }) => (
              <tr key={category}>
                <td className="px-3 py-2">{CATEGORY_LABELS[category]}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatPHP(total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-emerald-50/60">
            <tr>
              <td className="px-3 py-2 font-semibold">Total</td>
              <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                {formatPHP(view.stats.sharedAdvances)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-xs">
        <h2 className="flex items-center justify-between font-semibold">
          Out-of-Pocket by Person
          <Users className="size-4 text-muted-foreground" />
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">Advances plus bills each person paid (the matrix&apos;s Own Adv).</p>
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
