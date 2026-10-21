import { Layers, Users } from "lucide-react";
import { MemberMark } from "@/components/member-mark";
import { CATEGORY_LABELS } from "@/lib/format";
import { formatPHP, sumCentavos } from "@/lib/money";
import type { Category, PeriodView } from "@/lib/periods";
import { cn } from "@/lib/utils";

// Sidebar on the Advances tab: the log added up two ways, by category and by person. Both
// totals equal the log's total with no filters (bills paid count as advances, as in Own Adv).
export function AdvancesReport({ view }: { view: PeriodView }) {
  const byCategory = [
    // Confirmed bills: the header's "Total core bills", credited in full to whoever paid them.
    { key: "bills", label: "Bills", total: view.stats.coreBills },
    ...(Object.keys(CATEGORY_LABELS) as Category[]).map((category) => ({
      key: category,
      label: CATEGORY_LABELS[category],
      total: sumCentavos(view.advances.filter((a) => a.category === category).map((a) => a.amount)),
    })),
  ];
  const rowOf = new Map(view.rows.map((r) => [r.memberId, r]));
  // No rows when the month's numbers can't be computed (the layout's banner says so). Showing ₱0
  // then would look like a mismatch with the log, so the per-person total shows "—" instead.
  const computed = view.rows.length > 0;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5 shadow-xs">
        <h2 className="flex items-center justify-between font-semibold">
          Advances by Category
          <Layers className="size-4 text-muted-foreground" />
        </h2>
        <ul className="mt-3 divide-y text-sm">
          {byCategory.map(({ key, label, total }) => (
            <li key={key} className="flex items-center justify-between py-2">
              {label}
              <span className="font-mono font-medium tabular-nums">{formatPHP(total)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between py-2 font-semibold">
            Total
            <span className="font-mono tabular-nums">
              {formatPHP(view.stats.coreBills + view.stats.sharedAdvances)}
            </span>
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
            const paid = row ? row.ownAdvances + row.billsPaid : null;
            return (
              // Greyed when they paid nothing, so the people who did stand out.
              <li key={m.id} className={cn("flex items-center justify-between py-2", paid === 0 && "text-muted-foreground")}>
                <span className="flex items-center gap-2">
                  <MemberMark dotClass={m.dotClass} emoji={m.emoji} />
                  {m.name}
                </span>
                <span className="font-mono font-medium tabular-nums">{paid === null ? "—" : formatPHP(paid)}</span>
              </li>
            );
          })}
          <li className="flex items-center justify-between py-2 font-semibold">
            Total
            <span className="font-mono tabular-nums">
              {computed ? formatPHP(sumCentavos(view.rows.map((r) => r.ownAdvances + r.billsPaid))) : "—"}
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
