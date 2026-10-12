"use client";

import { Calculator, ChevronRight, Info, Landmark, Scale, SlidersHorizontal, Zap } from "lucide-react";
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
import { EmailedNote, PendingBillActions } from "@/components/emailed-bills";
import { InlineInput, type FormAction } from "@/components/inline-input";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { useDragScroll } from "@/hooks/use-drag-scroll";
import { dayLabel, monthLabel } from "@/lib/format";
import { HOUSE_BUDGET_LABEL } from "@/lib/household-config";
import { formatPHP, fromCentavos, sumCentavos } from "@/lib/money";
import type { PeriodView, ViewBill, ViewColumn, ViewRow } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { useCanEdit } from "@/components/viewer-context";

const cellBase = "px-3 py-2.5 whitespace-nowrap";
// Extra room under the Total row: macOS draws the horizontal scrollbar over the content.
const footCell = cn(cellBase, "pb-5");
const headBright = "bg-amber-300 text-zinc-900";

export function SplitTable({ view }: { view: PeriodView }) {
  // PA in an open month; everyone else sees plain values.
  const editable = useCanEdit(view.period.status);
  const { bills, columns, members } = view;
  const rowOf = new Map(view.rows.map((r) => [r.memberId, r]));
  const sum = (pick: (r: ViewRow) => number) => sumCentavos(view.rows.map(pick));
  const finalsTotal = sum((r) => r.monthFinal);
  // The House Budget's own row, once money has gone through it (months before it was used
  // stay as they were). Its numbers count in the totals, which then still come to ₱0.00. Not
  // while the numbers have a problem: members then open at ₱0 and the totals wouldn't add up.
  const budget = view.houseBudget;
  const showBudget =
    !view.issue && view.rows.length > 0 && (budget.opening !== 0 || budget.received !== 0 || budget.paidOut !== 0);
  const budgetIn = (amount: number) => (showBudget ? amount : 0);
  const mismatched = columns.filter((c) => c.difference !== 0);
  const dragScroll = useDragScroll<HTMLDivElement>();

  return (
    <div className="space-y-6">
      {/* The arrow on the right edge says there's more table to scroll to (the hook sets
          data-more-right on the scroller, its `peer`); it goes away once you reach the end. */}
      <div className="relative">
        <div
          {...dragScroll}
          className="peer overflow-x-auto rounded-xl border bg-white shadow-xs data-dragging:cursor-grabbing data-dragging:select-none data-scrollable:cursor-grab"
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
                    {bill.status === "pending" && (
                      <span className="ml-1.5 rounded-full bg-white/70 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber-800">
                        Pending
                      </span>
                    )}
                  </th>
                ))}
                {columns.map((column) => (
                  <th key={column.id} className={cn(cellBase, headBright, "min-w-36 text-center font-bold")}>
                    {column.name}
                  </th>
                ))}
                {[
                  { label: "Total" },
                  { label: "Own Advance (−)" },
                  { label: "Month Final" },
                  { label: "Prev Month Unsettled" },
                  { label: "Payments", title: "Recorded in Settle Up: − paid back, + received" },
                  { label: "Final" },
                ].map(({ label, title }) => (
                  <th key={label} title={title} className={cn(cellBase, headBright, "text-center font-bold")}>
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
                    {bill.paidBy ? (
                      // Visits are logged on the Helper tab; the total is what was handed over.
                      <Link
                        href={`/periods/${view.period.year}/${view.period.month}/helper`}
                        className="font-semibold underline decoration-dotted underline-offset-4 hover:text-amber-700"
                      >
                        {formatPHP(bill.total)}
                      </Link>
                    ) : editable && bill.splitMode !== "manual" ? (
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
                    {bill.paidBy && <div className="mt-1 font-sans text-[11px] text-muted-foreground">from the Helper tab</div>}
                    <EmailedNote bill={bill} />
                    {bill.status === "pending" && editable && <PendingBillActions bill={bill} />}
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
                      <td key={bill.id} className={cn(cellBase, "text-center", bill.status === "pending" && "text-zinc-500")}>
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
                    <td className={cn(cellBase, "text-center", row?.opening ? "text-zinc-700" : "text-zinc-500")}>
                      {row ? formatPHP(row.opening) : "—"}
                    </td>
                    <td className={cn(cellBase, "text-center", row && paymentsOf(row) ? "text-zinc-700" : "text-zinc-500")}>
                      {row ? signedPHP(paymentsOf(row)) : "—"}
                    </td>
                    <td className={cn(cellBase, "text-center")}>{row ? <Balance amount={row.balance} /> : "—"}</td>
                  </tr>
                );
              })}

              {showBudget && (
                <tr className="group hover:bg-zinc-50">
                  <th scope="row" className={cn(cellBase, "sticky left-0 z-10 bg-white group-hover:bg-zinc-50 text-left font-sans font-medium")}>
                    <span className="flex items-center gap-2">
                      <Landmark className="size-3.5 text-zinc-500" aria-hidden />
                      {HOUSE_BUDGET_LABEL}
                    </span>
                  </th>
                  {/* It takes no share of anything: only money in and out. */}
                  <td colSpan={bills.length + columns.length + 3} />
                  <td className={cn(cellBase, "text-center", budget.opening ? "text-zinc-700" : "text-zinc-500")}>
                    {formatPHP(budget.opening)}
                  </td>
                  <td className={cn(cellBase, "text-center", paymentsOf(budget) ? "text-zinc-700" : "text-zinc-500")}>
                    {signedPHP(paymentsOf(budget))}
                  </td>
                  <td className={cn(cellBase, "text-center")}>
                    <HouseBudgetBalance amount={budget.balance} />
                  </td>
                </tr>
              )}

              {(["dueDate", "paidOn"] as const).map((field) => (
                <tr key={field} className="bg-zinc-50 font-sans">
                  <th scope="row" className={cn(cellBase, "sticky left-0 z-10 bg-zinc-50 text-left font-medium text-zinc-600")}>
                    {field === "dueDate" ? "Due date" : "Date paid"}
                  </th>
                  {bills.map((bill) => (
                    <td key={bill.id} className={cn(cellBase, "text-center")}>
                      {hasDates(bill) && <DateCell bill={bill} field={field} editable={editable} />}
                    </td>
                  ))}
                  <td colSpan={columns.length} />
                  <td colSpan={6} />
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
                  {finalsTotal !== 0 && <FinalsOffNote mismatched={mismatched} />}
                </td>
                <td className={cn(footCell, "text-center")}>{formatPHP(sum((r) => r.opening) + budgetIn(budget.opening))}</td>
                <td className={cn(footCell, "text-center")}>{signedPHP(sum(paymentsOf) + budgetIn(paymentsOf(budget)))}</td>
                <td className={cn(footCell, "text-center")}>{formatPHP(sum((r) => r.balance) + budgetIn(budget.balance))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 rounded-full bg-white/90 p-0.5 opacity-0 shadow-xs transition-opacity peer-data-more-right:opacity-100"
        >
          <ChevronRight className="size-5 text-zinc-400" />
        </div>
      </div>

      <ExplainerCards />
    </div>
  );
}

/**
 * Payments recorded this month, signed the way they move the Final: paying back lowers what
 * you owe (−), receiving lowers what you're owed (+). Everyone's plus the House Budget's adds up
 * to ₱0.00.
 */
const paymentsOf = (r: { received: number; paidOut: number }) => r.received - r.paidOut;

/** The House Budget's Final: what it holds, still to be paid out (not "To pay" / "To receive"). */
function HouseBudgetBalance({ amount }: { amount: number }) {
  if (amount === 0) return <span className="text-zinc-500">₱0.00 <span className="font-sans text-[11px]">Empty</span></span>;
  return (
    <span className="font-semibold text-zinc-700">
      {formatPHP(Math.abs(amount))}
      <span className="ml-1 font-sans text-[11px] font-normal">{amount > 0 ? "Holding" : "More out than in"}</span>
    </span>
  );
}

function signedPHP(amount: number): string {
  if (amount === 0) return formatPHP(0);
  return `${amount > 0 ? "+" : "−"}${formatPHP(Math.abs(amount))}`;
}

/** Under a Month Final total that isn't ₱0.00: a short note; its popover names the columns that
 * don't add up (kept out of the cell so it doesn't stretch the column). */
function FinalsOffNote({ mismatched }: { mismatched: ViewColumn[] }) {
  if (mismatched.length === 0) return <div className="font-sans text-[11px] font-normal">should be ₱0.00</div>;
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        aria-label="Why the Month Final total isn't ₱0.00"
        className="mx-auto flex items-center gap-1 rounded font-sans text-[11px] font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        should be ₱0.00
        <Info className="size-3" />
      </PopoverTrigger>
      <PopoverContent className="w-64 font-sans">
        <div>
          <PopoverTitle>Should be ₱0.00</PopoverTitle>
          <PopoverDescription className="text-xs">These columns don&apos;t add up to their total:</PopoverDescription>
        </div>
        <ul className="divide-y text-xs">
          {mismatched.map((c) => (
            <li key={c.id} className="flex justify-between gap-3 py-1.5">
              <span>{c.name}</span>
              <span className="shrink-0 font-mono whitespace-nowrap tabular-nums">
                {formatPHP(Math.abs(c.difference))} {c.difference > 0 ? "over" : "short"}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
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
  if (!column.includedIds.includes(memberId)) return <span className="text-zinc-500">—</span>;
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

/** False for the Helper: no due date or date paid (her visits have their own dates, on the Helper tab). */
const hasDates = (bill: ViewBill) => bill.kind !== "helper";

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
      body: "Water, PLDT and the Helper split evenly to the centavo. Any leftover centavo goes to the admin, who collects.",
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
