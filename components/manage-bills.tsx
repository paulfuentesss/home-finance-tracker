"use client";

import { deleteBill, renameBill } from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { InlineInput } from "@/components/inline-input";
import { AddBillDialog } from "@/components/entry-dialogs";
import { formatPHP } from "@/lib/money";
import type { PeriodView, ViewBill } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { useCanEdit } from "@/components/viewer-context";

const MODE_PILLS = {
  equal: { label: "Auto equal", className: "bg-emerald-800 text-white" },
  points: { label: "Points", className: "bg-sky-800 text-white" },
  manual: { label: "Manual", className: "bg-amber-900 text-white" },
} as const;

export function ManageBills({ view }: { view: PeriodView }) {
  // PA in an open month; everyone else sees plain values.
  const editable = useCanEdit(view.period.status);
  return (
    <section className="rounded-xl border bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Bill Columns</h2>
          <p className="mt-1 text-sm text-muted-foreground">Each bill&apos;s split is fixed: Meralco by points, the rest as chosen when added.</p>
        </div>
        {editable && <AddBillDialog view={view} label="New column" />}
      </div>
      <ul className="mt-4 space-y-2">
        {view.bills.map((bill) => (
          <BillRow key={bill.id} bill={bill} editable={editable} />
        ))}
        {view.bills.length === 0 && (
          <li className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No bill columns yet.</li>
        )}
      </ul>
    </section>
  );
}

function BillRow({ bill, editable }: { bill: ViewBill; editable: boolean }) {
  const pill = MODE_PILLS[bill.splitMode];

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border bg-zinc-50/60 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {editable ? (
            <InlineInput
              action={renameBill}
              hidden={{ billId: bill.id }}
              name="name"
              value={bill.name}
              label="Bill name"
              maxLength={60}
              allowEmpty={false}
              className="min-w-0"
              inputClassName="w-full border-transparent bg-transparent px-1 font-semibold hover:border-input focus:bg-white"
            />
          ) : (
            <span className="font-semibold">{bill.name}</span>
          )}
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", pill.className)}>
            {pill.label}
            {bill.splitMode === "points" && ` · ${bill.totalPoints}`}
          </span>
        </div>
        <p className="mt-0.5 px-1 font-mono text-sm text-muted-foreground tabular-nums">Base: {formatPHP(bill.total)}</p>
      </div>
      {editable && (
        <ConfirmDeleteButton
          label={`Delete ${bill.name}`}
          title={`Delete the ${bill.name} column?`}
          description="Its amounts are removed from this month and everyone's totals are recalculated. Any proof attached to it is deleted too. Other months keep their own copy."
          onConfirm={() => deleteBill(bill.id)}
        />
      )}
    </li>
  );
}
