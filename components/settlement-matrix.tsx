"use client";

import { useActionState } from "react";
import { updateBillTotal, type ActionState } from "@/app/periods/[year]/[month]/actions";
import { formatPHP, fromCentavos, sumCentavos } from "@/lib/money";
import type { PeriodView } from "@/lib/periods";
import { cn } from "@/lib/utils";

interface Props {
  view: PeriodView;
}

// Styling follows the App.jsx prototype (slate table, amber inputs, rose/emerald finals).
export function SettlementMatrix({ view }: Props) {
  const { bills, rows, members } = view;
  const editable = view.period.status === "open";
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const collectorId = members.find((m) => m.isCollector)?.id;
  const showCredit = rows.some((r) => r.billPayerCredit !== 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700/60 bg-slate-900/80 text-slate-300">
            <th className="sticky left-0 z-10 bg-slate-900 p-3 font-semibold">Housemate</th>
            {bills.map((bill) => (
              <th key={bill.id} className="min-w-[130px] p-3 text-center align-top font-semibold">
                <div>{bill.name}</div>
                {editable ? (
                  <BillTotalInput billId={bill.id} name={bill.name} total={bill.total} />
                ) : (
                  <div className="mt-1 font-mono text-xs text-amber-300">{formatPHP(bill.total)}</div>
                )}
                {bill.paidById !== collectorId && (
                  <div className="mt-1 text-[11px] font-normal text-slate-400">paid by {nameOf.get(bill.paidById)}</div>
                )}
                {bill.status === "pending" && (
                  <div className="mt-1 text-[11px] font-normal text-amber-400">pending review</div>
                )}
              </th>
            ))}
            <th className="p-3 text-right font-semibold">Adv. Shared</th>
            <th className="p-3 text-right font-semibold">Own Adv (-)</th>
            {showCredit && <th className="p-3 text-right font-semibold">Paid a Bill (-)</th>}
            <th className="p-3 text-right font-semibold text-emerald-400">Month Final</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-700/40 font-mono">
          {rows.map((row) => (
            <tr key={row.memberId} className="group transition-colors hover:bg-slate-800/40">
              <td className="sticky left-0 z-10 bg-[#182234] p-3 font-sans font-semibold text-slate-200">
                {row.name}
                {row.isCollector && (
                  <span className="ml-2 rounded-full border border-emerald-500/30 bg-emerald-950/50 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    collector
                  </span>
                )}
              </td>
              {bills.map((bill) => (
                <td key={bill.id} className="p-3 text-center text-slate-300">
                  {formatPHP(row.billShares[String(bill.id)] ?? 0)}
                </td>
              ))}
              <td className="p-3 text-right text-slate-300">{formatPHP(row.advanceShare)}</td>
              <td className="p-3 text-right text-amber-400">{formatPHP(row.ownAdvances)}</td>
              {showCredit && <td className="p-3 text-right text-amber-400">{formatPHP(row.billPayerCredit)}</td>}
              <td className="p-3 text-right">
                <MonthFinal amount={row.monthFinal} isCollector={row.isCollector} />
              </td>
            </tr>
          ))}
        </tbody>

        <tfoot className="font-mono">
          <tr className="border-t border-slate-700/60 bg-slate-900/60 font-semibold text-slate-300">
            <td className="sticky left-0 z-10 bg-slate-900 p-3 font-sans">Total</td>
            {bills.map((bill) => (
              <td key={bill.id} className="p-3 text-center">
                {formatPHP(bill.status === "confirmed" ? bill.total : 0)}
              </td>
            ))}
            <td className="p-3 text-right">{formatPHP(sumCentavos(rows.map((r) => r.advanceShare)))}</td>
            <td className="p-3 text-right">{formatPHP(sumCentavos(rows.map((r) => r.ownAdvances)))}</td>
            {showCredit && (
              <td className="p-3 text-right">{formatPHP(sumCentavos(rows.map((r) => r.billPayerCredit)))}</td>
            )}
            <td className="p-3 text-right text-white">{formatPHP(sumCentavos(rows.map((r) => r.monthFinal)))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function MonthFinal({ amount, isCollector }: { amount: number; isCollector: boolean }) {
  if (isCollector) {
    return (
      <span className="font-bold text-slate-400" title="The collector's own share, already paid by fronting the bills">
        {formatPHP(amount)}
        <span className="ml-1 font-sans text-[11px] font-normal">own share</span>
      </span>
    );
  }
  const owes = amount > 0;
  return (
    <span className={cn("font-bold", owes ? "text-rose-400" : "text-emerald-400")}>
      {formatPHP(Math.abs(amount))}
      <span className="ml-1 font-sans text-[11px] font-normal">{owes ? "owes" : amount < 0 ? "is owed" : "settled"}</span>
    </span>
  );
}

/**
 * Editable bill total. Saves on Enter or when the field loses focus; the server re-splits
 * the shares (keeping any manual overrides) and the page refreshes with the new numbers.
 */
function BillTotalInput({ billId, name, total }: { billId: number; name: string; total: number }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateBillTotal, null);
  const current = fromCentavos(total);

  return (
    <form action={formAction} className="mt-1">
      <input type="hidden" name="billId" value={billId} />
      <input
        // Remount when the saved total changes so the field shows the server's value.
        key={current}
        name="total"
        defaultValue={current}
        inputMode="decimal"
        placeholder="Total ₱"
        aria-label={`${name} total`}
        aria-invalid={state?.ok === false || undefined}
        disabled={pending}
        className="w-28 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-center font-mono text-xs text-amber-300 focus:border-amber-400 focus:outline-none disabled:opacity-50 aria-invalid:border-rose-400"
        onBlur={(e) => {
          if (e.currentTarget.value.trim() !== current) e.currentTarget.form?.requestSubmit();
        }}
      />
      {state?.ok === false && (
        <p className="mx-auto mt-1 max-w-32 text-[11px] font-normal whitespace-normal text-rose-400">{state.error}</p>
      )}
    </form>
  );
}
