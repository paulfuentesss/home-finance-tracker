"use client";

import { useActionState } from "react";
import { updateBillPoints, type ActionState } from "@/app/periods/[year]/[month]/actions";
import { formatPHP } from "@/lib/money";
import type { PeriodView, ViewBill } from "@/lib/periods";
import { cn } from "@/lib/utils";

// Meralco is always split by points; this is the one place to change the allocation.
export function MeralcoPoints({ view }: { view: PeriodView }) {
  const editable = view.period.status === "open";
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
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateBillPoints, null);
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
          <form action={formAction} className="flex items-center gap-1">
            <input type="hidden" name="billId" value={bill.id} />
            <input type="hidden" name="memberId" value={memberId} />
            <input
              key={current}
              name="points"
              defaultValue={current}
              inputMode="decimal"
              aria-label={`${name} points`}
              aria-invalid={state?.ok === false || undefined}
              readOnly={pending}
              className="h-8 w-16 rounded-md border border-input px-2 text-right font-mono focus:border-amber-500 focus:outline-none aria-invalid:border-rose-500"
              onBlur={(e) => {
                if (!pending && e.currentTarget.value.trim() !== current) e.currentTarget.form?.requestSubmit();
              }}
            />
            <span className="text-muted-foreground">pts</span>
          </form>
        ) : (
          <span className="font-mono">{current} pts</span>
        )}
      </span>
      {state?.ok === false && <span className="basis-full text-xs text-destructive">{state.error}</span>}
    </li>
  );
}
