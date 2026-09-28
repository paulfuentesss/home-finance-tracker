"use client";

import { updateBillPoints } from "@/app/periods/[year]/[month]/actions";
import { InlineInput } from "@/components/inline-input";
import { formatPHP } from "@/lib/money";
import type { PeriodView, ViewBill } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { useCanEdit } from "@/components/viewer-context";

// Meralco is always split by points; this is the one place to change the allocation.
export function MeralcoPoints({ view }: { view: PeriodView }) {
  // PA in an open month; everyone else sees plain values.
  const editable = useCanEdit(view.period.status);
  const bills = view.bills.filter((b) => b.splitMode === "points");
  if (bills.length === 0) return null;

  return (
    <section className="rounded-xl border bg-white p-5 shadow-xs">
      <h2 className="text-lg font-semibold">Meralco Points</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Change when the allocation changes (new aircon, PC, someone moving rooms). Saving re-splits the bill.
      </p>
      {bills.map((bill) => (
        <div key={bill.id} className="mt-4">
          <ul className="divide-y rounded-lg border">
            {view.members.map((m) => (
              <PointsRow key={m.id} bill={bill} memberId={m.id} name={m.name} dotClass={m.dotClass} editable={editable} />
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted-foreground">
            Total <span className="font-mono font-medium text-foreground">{bill.totalPoints}</span> points
            {bill.perUnit && bill.total > 0 && (
              <>
                {" "}
                · <span className="font-mono">{formatPHP(bill.perUnit.amount)}</span> per point this month
              </>
            )}
          </p>
        </div>
      ))}
    </section>
  );
}

function PointsRow({
  bill,
  memberId,
  name,
  dotClass,
  editable,
}: {
  bill: ViewBill;
  memberId: number;
  name: string;
  dotClass: string;
  editable: boolean;
}) {
  const share = bill.shares[String(memberId)];
  const current = String(share?.points ?? 0);

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <span className={cn("size-2 rounded-full", dotClass)} aria-hidden />
        {name}
      </span>
      <span className="flex items-center gap-3">
        <span className="font-mono text-muted-foreground tabular-nums">{formatPHP(share?.amount ?? 0)}</span>
        {editable ? (
          <InlineInput
            action={updateBillPoints}
            hidden={{ billId: bill.id, memberId }}
            name="points"
            value={current}
            label={`${name} points`}
            suffix="pts"
            inputMode="decimal"
            inputClassName="h-8 w-16 px-2 text-right font-mono"
          />
        ) : (
          <span className="font-mono">{current} pts</span>
        )}
      </span>
    </li>
  );
}
