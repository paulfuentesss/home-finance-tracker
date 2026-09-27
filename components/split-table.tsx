"use client";

import { Calculator, Scale, SlidersHorizontal, Zap } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  setBillSplitMode,
  updateBillDates,
  updateBillPoints,
  updateBillShare,
  updateBillTotal,
  type ActionState,
} from "@/app/periods/[year]/[month]/actions";
import { AddBillDialog, AddMemberDialog } from "@/components/entry-dialogs";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { monthLabel } from "@/lib/format";
import { formatPHP, fromCentavos, sumCentavos } from "@/lib/money";
import type { PeriodView, ViewBill, ViewRow } from "@/lib/periods";
import type { SplitMode } from "@/lib/settlement";
import { cn } from "@/lib/utils";

const MODE_STYLES: Record<SplitMode, { label: string; className: string }> = {
  equal: { label: "Auto equal", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  points: { label: "Points", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  manual: { label: "Manual", className: "bg-amber-50 text-amber-700 ring-amber-200" },
};

const cellBase = "px-3 py-2.5 whitespace-nowrap";
const summaryTint = "bg-amber-50/60";

export function SplitTable({ view }: { view: PeriodView }) {
  const editable = view.period.status === "open";
  const { bills, pools, adjustments, members } = view;
  const rowOf = new Map(view.rows.map((r) => [r.memberId, r]));
  const sum = (pick: (r: ViewRow) => number) => sumCentavos(view.rows.map(pick));
  const finalsTotal = sum((r) => r.monthFinal);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5 shadow-xs">
        <div>
          <h2 className="text-lg font-semibold">
            Household Summary Matrix{" "}
            <span className="text-sm font-normal text-muted-foreground">({members.length} members)</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Type a bill&apos;s total to split it, or switch a column to Points or Manual.
          </p>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <AddBillDialog view={view} />
            <AddMemberDialog />
          </div>
        )}
      </section>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-xs">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-zinc-50 text-zinc-700">
              <th className={cn(cellBase, "sticky left-0 z-10 bg-zinc-50 text-left font-semibold")}>
                {monthLabel(view.period.year, view.period.month)}
              </th>
              {bills.map((bill) => (
                <th key={bill.id} className={cn(cellBase, "min-w-36 text-center font-semibold")}>
                  <div>{bill.name}</div>
                  <SplitModePill bill={bill} editable={editable} />
                </th>
              ))}
              {pools.map((pool) => (
                <th key={pool.key} className={cn(cellBase, "min-w-32 text-center font-semibold")}>
                  {pool.label}
                </th>
              ))}
              {adjustments.map((adj) => (
                <th key={adj.advanceId} className={cn(cellBase, "min-w-32 text-center font-semibold")}>
                  {adj.label}
                </th>
              ))}
              {["Total", "Own Adv (−)", "Month Final", "Prev Month Unsettled", "Final"].map((label) => (
                <th key={label} className={cn(cellBase, summaryTint, "text-right font-semibold")}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y font-mono tabular-nums">
            {/* "Bill" row: the totals, like the sheet */}
            <tr className="bg-zinc-50/60">
              <th scope="row" className={cn(cellBase, "sticky left-0 z-10 bg-zinc-50 text-left font-sans font-medium italic")}>
                Bill
              </th>
              {bills.map((bill) => (
                <td key={bill.id} className={cn(cellBase, "text-center")}>
                  {editable && bill.splitMode !== "manual" ? (
                    <MoneyInput
                      action={updateBillTotal}
                      hidden={{ billId: bill.id }}
                      name="total"
                      value={bill.total}
                      label={`${bill.name} total`}
                    />
                  ) : (
                    <span className="font-semibold">{formatPHP(bill.total)}</span>
                  )}
                  {bill.perUnit && bill.total > 0 && (
                    <div className="mt-1 text-[11px] text-emerald-700">
                      ({formatPHP(bill.perUnit.amount)} / {bill.perUnit.unit})
                    </div>
                  )}
                  {bill.splitMode === "manual" && <div className="mt-1 text-[11px] text-muted-foreground">sum of shares</div>}
                </td>
              ))}
              {pools.map((pool) => (
                <td key={pool.key} className={cn(cellBase, "text-center font-semibold")}>
                  {formatPHP(pool.total)}
                </td>
              ))}
              {adjustments.map((adj) => (
                <td key={adj.advanceId} className={cn(cellBase, "text-center font-semibold")}>
                  {formatPHP(adj.total)}
                </td>
              ))}
              <td colSpan={5} className={summaryTint} />
            </tr>

            {members.map((member) => {
              const row = rowOf.get(member.id);
              return (
                <tr key={member.id} className="hover:bg-zinc-50/60">
                  <th scope="row" className={cn(cellBase, "sticky left-0 z-10 bg-white text-left font-sans font-medium")}>
                    <span className="flex items-center gap-2">
                      <span className={cn("size-2.5 rounded-full", member.dotClass)} aria-hidden />
                      {member.name}
                      {member.isCollector && (
                        <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] font-normal text-zinc-600">collector</span>
                      )}
                    </span>
                  </th>
                  {bills.map((bill) => (
                    <td key={bill.id} className={cn(cellBase, "text-center")}>
                      <BillShareCell bill={bill} memberId={member.id} editable={editable} />
                    </td>
                  ))}
                  {pools.map((pool) => (
                    <td key={pool.key} className={cn(cellBase, "text-center text-zinc-600")}>
                      {row?.poolShares[pool.key] !== undefined ? formatPHP(row.poolShares[pool.key]) : "—"}
                    </td>
                  ))}
                  {adjustments.map((adj) => (
                    <td key={adj.advanceId} className={cn(cellBase, "text-center text-zinc-600")}>
                      {row?.customShares[String(adj.advanceId)] !== undefined
                        ? formatPHP(row.customShares[String(adj.advanceId)])
                        : "—"}
                    </td>
                  ))}
                  <td className={cn(cellBase, summaryTint, "text-right font-semibold")}>{row ? formatPHP(row.total) : "—"}</td>
                  <td className={cn(cellBase, summaryTint, "text-right text-emerald-700")}>
                    {row ? formatPHP(row.ownAdvances + row.billsPaid) : "—"}
                  </td>
                  <td className={cn(cellBase, summaryTint, "text-right")}>
                    {row ? <Balance amount={row.monthFinal} /> : "—"}
                  </td>
                  <td className={cn(cellBase, summaryTint, "text-right text-zinc-600")}>
                    {row ? (row.opening === 0 ? "—" : formatPHP(row.opening)) : "—"}
                  </td>
                  <td className={cn(cellBase, summaryTint, "text-right")}>{row ? <Balance amount={row.balance} /> : "—"}</td>
                </tr>
              );
            })}

            {(["dueDate", "paidOn"] as const).map((field) => (
              <tr key={field} className="bg-zinc-50/60 font-sans">
                <th scope="row" className={cn(cellBase, "sticky left-0 z-10 bg-zinc-50 text-left font-medium text-zinc-600")}>
                  {field === "dueDate" ? "Due date" : "Date paid"}
                </th>
                {bills.map((bill) => (
                  <td key={bill.id} className={cn(cellBase, "text-center")}>
                    <DateCell bill={bill} field={field} editable={editable} />
                  </td>
                ))}
                <td colSpan={pools.length + adjustments.length} />
                <td colSpan={5} className={summaryTint} />
              </tr>
            ))}
          </tbody>

          <tfoot className="font-mono tabular-nums">
            <tr className="border-t bg-zinc-50 font-semibold">
              <th scope="row" className={cn(cellBase, "sticky left-0 z-10 bg-zinc-50 text-left font-sans")}>
                Total
              </th>
              <td colSpan={bills.length + pools.length + adjustments.length} />
              <td className={cn(cellBase, summaryTint, "text-right")}>{formatPHP(sum((r) => r.total))}</td>
              <td className={cn(cellBase, summaryTint, "text-right")}>{formatPHP(sum((r) => r.ownAdvances + r.billsPaid))}</td>
              <td
                className={cn(cellBase, summaryTint, "text-right", finalsTotal !== 0 && "text-rose-600")}
                title="Everyone's Month Final always adds up to ₱0.00"
              >
                {formatPHP(finalsTotal)}
                {finalsTotal !== 0 && <span className="ml-1 font-sans text-[11px]">should be ₱0.00</span>}
              </td>
              <td className={cn(cellBase, summaryTint, "text-right")}>{formatPHP(sum((r) => r.opening))}</td>
              <td className={cn(cellBase, summaryTint, "text-right")}>{formatPHP(sum((r) => r.balance))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ExplainerCards />
    </div>
  );
}

function Balance({ amount }: { amount: number }) {
  if (amount === 0) return <span className="text-zinc-500">₱0.00 <span className="font-sans text-[11px]">Settled</span></span>;
  const owes = amount > 0;
  return (
    <span className={cn("font-semibold", owes ? "text-rose-600" : "text-emerald-600")}>
      {formatPHP(Math.abs(amount))}
      <span className="ml-1 font-sans text-[11px] font-normal">{owes ? "Owes" : "Owed / Reimburse"}</span>
    </span>
  );
}

function SplitModePill({ bill, editable }: { bill: ViewBill; editable: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const style = MODE_STYLES[bill.splitMode];
  const label = bill.splitMode === "points" ? `Points · ${bill.totalPoints}` : style.label;
  const pillClass = cn("mt-1 inline-flex h-6 items-center rounded-full px-2 text-[11px] font-medium ring-1 ring-inset", style.className);

  if (!editable) return <span className={pillClass}>{label}</span>;
  const items = (Object.keys(MODE_STYLES) as SplitMode[]).map((value) => ({ value, label: MODE_STYLES[value].label }));

  return (
    <div>
      <Select
        items={items}
        value={bill.splitMode}
        onValueChange={(mode) =>
          mode &&
          startTransition(async () => {
            const result = await setBillSplitMode(bill.id, mode as SplitMode);
            setError(result?.ok === false ? result.error : null);
          })
        }
      >
        <SelectTrigger
          aria-label={`${bill.name} split mode`}
          size="sm"
          disabled={pending}
          className={cn(pillClass, "w-auto gap-1 border-none shadow-none [&_svg]:size-3")}
        >
          <span>{label}</span>
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="mt-1 max-w-36 text-[11px] font-normal whitespace-normal text-destructive">{error}</p>}
    </div>
  );
}

function BillShareCell({ bill, memberId, editable }: { bill: ViewBill; memberId: number; editable: boolean }) {
  const share = bill.shares[String(memberId)];
  const amount = share?.amount ?? 0;

  if (bill.splitMode === "manual" && editable) {
    return (
      <MoneyInput
        action={updateBillShare}
        hidden={{ billId: bill.id, memberId }}
        name="amount"
        value={amount}
        label={`${bill.name} share`}
      />
    );
  }
  if (bill.splitMode === "points") {
    return (
      <div className="flex flex-col items-center gap-1">
        <span>{formatPHP(amount)}</span>
        {editable ? (
          <PointsInput billId={bill.id} memberId={memberId} points={share?.points ?? 0} billName={bill.name} />
        ) : (
          <span className="text-[11px] text-sky-700">{share?.points ?? 0} pts</span>
        )}
      </div>
    );
  }
  return <span>{formatPHP(amount)}</span>;
}

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * An amount field that saves on Enter or when it loses focus (only if changed). The server
 * re-splits and the page refreshes with the new numbers.
 */
function MoneyInput({
  action,
  hidden,
  name,
  value,
  label,
}: {
  action: FormAction;
  hidden: Record<string, number>;
  name: string;
  value: number;
  label: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const current = fromCentavos(value);
  return (
    <form action={formAction} className="inline-block">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="relative inline-flex items-center">
        <span className="pointer-events-none absolute left-2 text-xs text-muted-foreground">₱</span>
        <input
          key={current}
          name={name}
          defaultValue={current}
          inputMode="decimal"
          aria-label={label}
          aria-invalid={state?.ok === false || undefined}
          disabled={pending}
          className="h-8 w-28 rounded-md border border-input bg-white pr-2 pl-5 text-right font-mono text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none disabled:opacity-50 aria-invalid:border-rose-500"
          onBlur={(e) => {
            if (e.currentTarget.value.trim() !== current) e.currentTarget.form?.requestSubmit();
          }}
        />
      </label>
      {state?.ok === false && <p className="mx-auto mt-1 max-w-32 font-sans text-[11px] whitespace-normal text-destructive">{state.error}</p>}
    </form>
  );
}

function PointsInput({ billId, memberId, points, billName }: { billId: number; memberId: number; points: number; billName: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateBillPoints, null);
  const current = String(points);
  return (
    <form action={formAction} className="flex items-center gap-1 font-sans text-[11px] text-sky-700">
      <input type="hidden" name="billId" value={billId} />
      <input type="hidden" name="memberId" value={memberId} />
      <input
        key={current}
        name="points"
        defaultValue={current}
        inputMode="decimal"
        aria-label={`${billName} points`}
        aria-invalid={state?.ok === false || undefined}
        disabled={pending}
        className="h-6 w-12 rounded border border-sky-200 bg-sky-50 px-1 text-center font-mono focus:border-sky-500 focus:outline-none aria-invalid:border-rose-500"
        onBlur={(e) => {
          if (e.currentTarget.value.trim() !== current) e.currentTarget.form?.requestSubmit();
        }}
      />
      pts
      {state?.ok === false && (
        <span role="alert" className="text-destructive" title={state.error}>
          ! <span className="sr-only">{state.error}</span>
        </span>
      )}
    </form>
  );
}

function DateCell({ bill, field, editable }: { bill: ViewBill; field: "dueDate" | "paidOn"; editable: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateBillDates, null);
  const value = bill[field] ?? "";
  if (!editable) {
    return <span className="text-zinc-600">{value ? value.slice(5).replace("-", "/") : "—"}</span>;
  }
  return (
    <form action={formAction}>
      <input type="hidden" name="billId" value={bill.id} />
      <input type="hidden" name="field" value={field} />
      <input
        key={value}
        type="date"
        name="value"
        defaultValue={value}
        aria-label={`${bill.name} ${field === "dueDate" ? "due date" : "date paid"}`}
        disabled={pending}
        className="h-7 w-32 rounded-md border border-transparent bg-transparent px-1 text-center text-xs text-zinc-600 hover:border-input focus:border-amber-500 focus:outline-none"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      />
      {state?.ok === false && <p className="text-[11px] text-destructive">{state.error}</p>}
    </form>
  );
}

function ExplainerCards() {
  const cards = [
    {
      icon: Zap,
      title: "Automatic equal split",
      body: "Type a bill's total and it splits evenly to the centavo. Any leftover centavo goes to PA, the collector.",
      href: "#equal",
    },
    {
      icon: Calculator,
      title: "Points split",
      body: "Meralco is split by points (aircon, PC, general use). Cost per point = bill ÷ total points.",
      href: "#points",
    },
    {
      icon: SlidersHorizontal,
      title: "Manual mode",
      body: "Switch a column to Manual to type each person's amount. The bill total becomes the sum.",
      href: "#manual",
    },
    {
      icon: Scale,
      title: "Net payable balance",
      body: "Your share of everything minus what you paid. Positive means you owe; negative means you get money back. It all adds up to ₱0.00.",
      href: "#month-final",
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ icon: Icon, title, body, href }) => (
        <Link
          key={title}
          href={`/how-it-works${href}`}
          className="rounded-xl border bg-white p-4 shadow-xs transition-colors hover:border-amber-300"
        >
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="size-4 text-amber-600" />
            {title}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
        </Link>
      ))}
    </div>
  );
}
