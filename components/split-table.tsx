"use client";

import { Calculator, Scale, SlidersHorizontal, Zap } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  updateBillDates,
  updateBillShare,
  updateBillTotal,
  updateSharedColumnAmount,
  type ActionState,
} from "@/app/periods/[year]/[month]/actions";
import { Balance } from "@/components/balance";
import { InlineInput, type FormAction } from "@/components/inline-input";
import { useDragScroll } from "@/hooks/use-drag-scroll";
import { dayLabel, monthLabel } from "@/lib/format";
import { formatPHP, fromCentavos, sumCentavos } from "@/lib/money";
import type { PeriodView, ViewBill, ViewColumn, ViewRow } from "@/lib/periods";
import { cn } from "@/lib/utils";

const cellBase = "px-3 py-2.5 whitespace-nowrap";
// Extra room under the Total row: macOS draws the horizontal scrollbar over the content.
const footCell = cn(cellBase, "pb-5");
const headBright = "bg-amber-300 text-zinc-900";

export function SplitTable({ view }: { view: PeriodView }) {
  const editable = view.period.status === "open";
  const { bills, columns, members } = view;
  const rowOf = new Map(view.rows.map((r) => [r.memberId, r]));
  const sum = (pick: (r: ViewRow) => number) => sumCentavos(view.rows.map(pick));
  const finalsTotal = sum((r) => r.monthFinal);
  const mismatched = columns.filter((c) => c.difference !== 0);
  const dragScroll = useDragScroll<HTMLDivElement>();

  return (
    <div className="space-y-6">
      <div
        {...dragScroll}
        className="overflow-x-auto rounded-xl border bg-white shadow-xs data-dragging:cursor-grabbing data-dragging:select-none data-scrollable:cursor-grab"
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-amber-400">
              <th className={cn(cellBase, headBright, "sticky left-0 z-10 text-left font-bold")}>
                {monthLabel(view.period.year, view.period.month)}
              </th>
              {bills.map((bill) => (
                <th key={bill.id} className={cn(cellBase, headBright, "min-w-36 text-center font-bold")}>
                  {bill.name}
                </th>
              ))}
              {columns.map((column) => (
                <th key={column.id} className={cn(cellBase, headBright, "min-w-36 text-center font-bold")}>
                  {column.name}
                </th>
              ))}
              {["Total", "Own Advance (−)", "Month Final", "Prev Month Unsettled", "Final"].map((label) => (
                <th key={label} className={cn(cellBase, headBright, "text-center font-bold")}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y font-mono tabular-nums">
            {/* "Bill" row: each column's total, like the sheet */}
            <tr className="bg-zinc-50">
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
                  {bill.splitMode === "manual" && <div className="mt-1 text-[11px] text-muted-foreground">sum of shares</div>}
                </td>
              ))}
              {columns.map((column) => (
                <td key={column.id} className={cn(cellBase, "text-center")}>
                  <span className="font-semibold">{formatPHP(column.total)}</span>
                  {column.difference !== 0 && (
                    <div className="mt-1 font-sans text-[11px] font-medium text-rose-600">
                      {formatPHP(Math.abs(column.difference))} {column.difference > 0 ? "over" : "short"}
                    </div>
                  )}
                </td>
              ))}
              <td colSpan={5} />
            </tr>

            {members.map((member) => {
              const row = rowOf.get(member.id);
              return (
                <tr key={member.id} className="group hover:bg-zinc-50">
                  <th scope="row" className={cn(cellBase, "sticky left-0 z-10 bg-white group-hover:bg-zinc-50 text-left font-sans font-medium")}>
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
                  {columns.map((column) => (
                    <td key={column.id} className={cn(cellBase, "text-center text-zinc-700")}>
                      <ColumnShareCell column={column} memberId={member.id} row={row} editable={editable} />
                    </td>
                  ))}
                  <td className={cn(cellBase, "text-center font-semibold")}>{row ? formatPHP(row.total) : "—"}</td>
                  <td className={cn(cellBase, "text-center text-zinc-700")}>
                    {row ? formatPHP(row.ownAdvances + row.billsPaid) : "—"}
                  </td>
                  <td className={cn(cellBase, "text-center text-zinc-700")}>{row ? formatPHP(row.monthFinal) : "—"}</td>
                  <td className={cn(cellBase, "text-center", row?.opening ? "text-zinc-700" : "text-zinc-400")}>
                    {row ? formatPHP(row.opening) : "—"}
                  </td>
                  <td className={cn(cellBase, "text-center")}>{row ? <Balance amount={row.balance} /> : "—"}</td>
                </tr>
              );
            })}

            {(["dueDate", "paidOn"] as const).map((field) => (
              <tr key={field} className="bg-zinc-50 font-sans">
                <th scope="row" className={cn(cellBase, "sticky left-0 z-10 bg-zinc-50 text-left font-medium text-zinc-600")}>
                  {field === "dueDate" ? "Due date" : "Date paid"}
                </th>
                {bills.map((bill) => (
                  <td key={bill.id} className={cn(cellBase, "text-center")}>
                    <DateCell bill={bill} field={field} editable={editable} />
                  </td>
                ))}
                <td colSpan={columns.length} />
                <td colSpan={5} />
              </tr>
            ))}
          </tbody>

          <tfoot className="font-mono tabular-nums">
            <tr className="border-t border-amber-300 bg-amber-50 font-semibold">
              <th scope="row" className={cn(footCell, "sticky left-0 z-10 bg-amber-50 text-left font-sans")}>
                Total
              </th>
              <td colSpan={bills.length + columns.length} />
              <td className={cn(footCell, "text-center")}>{formatPHP(sum((r) => r.total))}</td>
              <td className={cn(footCell, "text-center")}>{formatPHP(sum((r) => r.ownAdvances + r.billsPaid))}</td>
              <td
                className={cn(footCell, "text-center", finalsTotal !== 0 && "text-rose-600")}
                title="Everyone's Month Final adds up to ₱0.00 when every column adds up"
              >
                {formatPHP(finalsTotal)}
                {finalsTotal !== 0 && (
                  <div className="font-sans text-[11px] font-normal">
                    should be ₱0.00
                    {mismatched.length > 0 &&
                      ` — ${mismatched
                        .map((c) => `${c.name} is ${formatPHP(Math.abs(c.difference))} ${c.difference > 0 ? "over" : "short"}`)
                        .join("; ")}`}
                  </div>
                )}
              </td>
              <td className={cn(footCell, "text-center")}>{formatPHP(sum((r) => r.opening))}</td>
              <td className={cn(footCell, "text-center")}>{formatPHP(sum((r) => r.balance))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ExplainerCards />
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
  return <span>{formatPHP(amount)}</span>;
}

function ColumnShareCell({
  column,
  memberId,
  row,
  editable,
}: {
  column: ViewColumn;
  memberId: number;
  row: ViewRow | undefined;
  editable: boolean;
}) {
  if (column.splitMode === "manual") {
    const typed = column.amounts[String(memberId)] ?? 0;
    return editable ? (
      <MoneyInput
        action={updateSharedColumnAmount}
        hidden={{ columnId: column.id, memberId }}
        name="amount"
        value={typed}
        label={`${column.name} amount`}
      />
    ) : (
      <span>{formatPHP(typed)}</span>
    );
  }
  const share = row?.columnShares[String(column.id)];
  if (!column.includedIds.includes(memberId)) return <span className="text-zinc-400">—</span>;
  return <span>{formatPHP(share ?? 0)}</span>;
}

/** An amount edited in place; the server re-splits and the page refreshes with the new numbers. */
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
  return (
    <InlineInput
      action={action}
      hidden={hidden}
      name={name}
      value={fromCentavos(value)}
      label={label}
      prefix="₱"
      inputMode="decimal"
      inputClassName="h-8 w-28 pr-2 text-right font-mono text-sm"
    />
  );
}

/**
 * Shows the date as "Sept. 6". A transparent native date input sits on top, so clicking the
 * label opens the browser's date picker and choosing a date saves it.
 */
function DateCell({ bill, field, editable }: { bill: ViewBill; field: "dueDate" | "paidOn"; editable: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateBillDates, null);
  const value = bill[field] ?? "";
  const label = value ? dayLabel(value) : "—";
  if (!editable) {
    return <span className="text-zinc-600">{label}</span>;
  }
  return (
    <form action={formAction}>
      <input type="hidden" name="billId" value={bill.id} />
      <input type="hidden" name="field" value={field} />
      <label className="relative inline-flex h-7 w-24 items-center justify-center rounded-md border border-transparent text-xs text-zinc-600 focus-within:border-amber-500 hover:border-input">
        <span className={cn(!value && "text-muted-foreground")}>{label}</span>
        <input
          key={value}
          type="date"
          name="value"
          defaultValue={value}
          aria-label={`${bill.name} ${field === "dueDate" ? "due date" : "date paid"}`}
          disabled={pending}
          className="absolute inset-0 cursor-pointer opacity-0"
          onClick={(e) => {
            try {
              e.currentTarget.showPicker();
            } catch {
              // Older browsers: clicking the input itself still opens their picker.
            }
          }}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
      </label>
      {state?.ok === false && <p className="text-[11px] text-destructive">{state.error}</p>}
    </form>
  );
}

function ExplainerCards() {
  const cards = [
    {
      icon: Zap,
      title: "Automatic equal split",
      body: "Water, PLDT and the Helper split evenly to the centavo. Any leftover centavo goes to PA, the collector.",
      href: "#equal",
    },
    {
      icon: Calculator,
      title: "Meralco points",
      body: "Meralco is always split by points (aircon, PC, general use). Points are set in Manage.",
      href: "#points",
    },
    {
      icon: SlidersHorizontal,
      title: "Shared columns",
      body: "Advances are logged into a shared column — Auto equal, or Manual when someone shares more.",
      href: "#shared-advances",
    },
    {
      icon: Scale,
      title: "Month Final",
      body: "Your share of everything minus what you paid. Positive means you owe; negative means you get money back.",
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
