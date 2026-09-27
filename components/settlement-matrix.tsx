"use client";

import { useActionState } from "react";
import { updateBillTotal, type ActionState } from "@/app/periods/[year]/[month]/actions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPHP, fromCentavos, sumCentavos } from "@/lib/money";
import type { PeriodView } from "@/lib/periods";
import { cn } from "@/lib/utils";

interface Props {
  view: PeriodView;
}

export function SettlementMatrix({ view }: Props) {
  const { bills, rows, members } = view;
  const editable = view.period.status === "open";
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const collectorId = members.find((m) => m.isCollector)?.id;
  const showCredit = rows.some((r) => r.billPayerCredit !== 0);

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table className="font-mono tabular-nums">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="sticky left-0 z-10 bg-muted font-sans">Member</TableHead>
            {bills.map((bill) => (
              <TableHead key={bill.id} className="min-w-36 py-2 text-right align-top font-sans">
                <div className="font-medium text-foreground">{bill.name}</div>
                {bill.paidById !== collectorId && (
                  <Badge variant="outline" className="mt-1">
                    paid by {nameOf.get(bill.paidById)}
                  </Badge>
                )}
                {bill.status === "pending" && (
                  <Badge variant="secondary" className="mt-1">
                    pending review
                  </Badge>
                )}
                {editable ? (
                  <BillTotalInput billId={bill.id} name={bill.name} total={bill.total} />
                ) : (
                  <div className="mt-1 font-mono text-xs text-muted-foreground">{formatPHP(bill.total)}</div>
                )}
              </TableHead>
            ))}
            <TableHead className="text-right font-sans">Adv. shared</TableHead>
            <TableHead className="text-right font-sans">Own adv. (−)</TableHead>
            {showCredit && <TableHead className="text-right font-sans">Paid a bill (−)</TableHead>}
            <TableHead className="text-right font-sans">Month final</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.memberId}>
              <TableCell className="sticky left-0 z-10 bg-background font-sans font-medium">
                {row.name}
                {row.isCollector && (
                  <Badge variant="secondary" className="ml-2">
                    collector
                  </Badge>
                )}
              </TableCell>
              {bills.map((bill) => (
                <TableCell key={bill.id} className="text-right text-muted-foreground">
                  {formatPHP(row.billShares[String(bill.id)] ?? 0)}
                </TableCell>
              ))}
              <TableCell className="text-right text-muted-foreground">{formatPHP(row.advanceShare)}</TableCell>
              <TableCell className="text-right text-amber-600 dark:text-amber-400">
                {formatPHP(row.ownAdvances)}
              </TableCell>
              {showCredit && (
                <TableCell className="text-right text-muted-foreground">{formatPHP(row.billPayerCredit)}</TableCell>
              )}
              <TableCell className="text-right">
                <MonthFinal amount={row.monthFinal} isCollector={row.isCollector} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>

        <TableFooter>
          <TableRow>
            <TableCell className="sticky left-0 z-10 bg-muted font-sans">Total</TableCell>
            {bills.map((bill) => (
              <TableCell key={bill.id} className="text-right">
                {formatPHP(bill.status === "confirmed" ? bill.total : 0)}
              </TableCell>
            ))}
            <TableCell className="text-right">{formatPHP(sumCentavos(rows.map((r) => r.advanceShare)))}</TableCell>
            <TableCell className="text-right">{formatPHP(sumCentavos(rows.map((r) => r.ownAdvances)))}</TableCell>
            {showCredit && (
              <TableCell className="text-right">{formatPHP(sumCentavos(rows.map((r) => r.billPayerCredit)))}</TableCell>
            )}
            <TableCell className="text-right font-semibold">
              {formatPHP(sumCentavos(rows.map((r) => r.monthFinal)))}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function MonthFinal({ amount, isCollector }: { amount: number; isCollector: boolean }) {
  if (isCollector) {
    return (
      <span className="text-muted-foreground" title="The collector's own share, already paid by fronting the bills">
        {formatPHP(amount)} <span className="font-sans text-xs">own share</span>
      </span>
    );
  }
  const owes = amount > 0;
  return (
    <span className={cn("font-semibold", owes ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
      {formatPHP(Math.abs(amount))}{" "}
      <span className="font-sans text-xs font-normal">{owes ? "owes" : amount < 0 ? "is owed" : "settled"}</span>
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
      <Input
        // Remount when the saved total changes so the field shows the server's value.
        key={current}
        name="total"
        defaultValue={current}
        inputMode="decimal"
        aria-label={`${name} total`}
        aria-invalid={state?.ok === false || undefined}
        disabled={pending}
        className="h-7 text-right font-mono text-xs"
        onBlur={(e) => {
          if (e.currentTarget.value.trim() !== current) e.currentTarget.form?.requestSubmit();
        }}
      />
      {state?.ok === false && <p className="mt-1 text-xs font-normal whitespace-normal text-destructive">{state.error}</p>}
    </form>
  );
}
