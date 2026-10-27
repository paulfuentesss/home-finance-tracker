"use client";

import { Calculator, ChevronRight, Info, Scale, SlidersHorizontal, Zap } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
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
import { dayLabel, shortMonthLabel, shortMonthName } from "@/lib/format";
import { HOUSE_BUDGET_LABEL } from "@/lib/household-config";
import { formatPHP, fromCentavos, sumCentavos } from "@/lib/money";
import type { PeriodView, ViewBill, ViewColumn, ViewRow } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { useCanEdit, useViewer } from "@/components/viewer-context";
import { HouseBudgetMark, MemberMark } from "@/components/member-mark";
import { YouTag } from "@/components/you-tag";

const cellBase = "px-3 py-2.5 whitespace-nowrap";
// Extra room under the Total row: macOS draws the horizontal scrollbar over the content.
const footCell = cn(cellBase, "pb-5");
// A pale amber head, the sheet's yellow toned down to match the amber accents elsewhere.
const headCell = "bg-amber-100 text-amber-950";
// The Final column, tinted top to bottom: it's the answer most people look for.
const finalCol = "border-l border-amber-200 bg-amber-100/50";
// The name column stays put while the table scrolls sideways. Once scrolled, it gets an edge so
// the columns sliding under it don't peek out as stray characters: a line and a soft fade drawn
// just past the cell (::after). Not a border, which doesn't travel with a sticky cell under
// border-collapse, nor a box-shadow, which browsers don't reliably draw on sticky table cells.
const stickyCol = cn(
  "sticky left-0 z-10",
  "after:pointer-events-none after:absolute after:inset-y-0 after:left-full after:w-1.5 after:border-l after:border-zinc-200",
  "after:bg-linear-to-r after:from-black/5 after:to-transparent after:opacity-0 after:transition-opacity",
  "group-data-scrolled-left/scroller:after:opacity-100",
);
// The space between a mark and the name squeezed out beside it; it goes too once scrolled.
const squeezeGap = "ml-2 max-sm:group-data-scrolled-left/scroller:ml-0";

export function SplitTable({ view }: { view: PeriodView }) {
  // PA in an open month; everyone else sees plain values.
  const editable = useCanEdit(view.period.status);
  const viewer = useViewer();
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
  const base = `/periods/${view.period.year}/${view.period.month}`;
  const dragScroll = useDragScroll<HTMLDivElement>();

  return (
    <div className="space-y-6">
      {/* The arrow on the right edge says there's more table to scroll to (the hook sets
          data-more-right on the scroller, its `peer`); it goes away once you reach the end.
          No scroll anchoring: when the name column narrows (Squeeze), a browser keeping the
          columns in place could pull the scroll back to the start, which widens it again. */}
      <div className="relative">
        <div
          {...dragScroll}
          className="peer group/scroller overflow-x-auto rounded-xl border bg-white shadow-xs [overflow-anchor:none] data-dragging:cursor-grabbing data-dragging:select-none data-scrollable:cursor-grab"
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-amber-300">
                <th className={cn(cellBase, headCell, stickyCol, "text-left font-bold")}>
                  <ScrollLabel
                    full={shortMonthLabel(view.period.year, view.period.month)}
                    short={shortMonthName(view.period.month)}
                  />
                </th>
                {bills.map((bill) => (
                  <th key={bill.id} className={cn(cellBase, headCell, "min-w-36 text-center font-bold")}>
                    {bill.name}
                    {bill.status === "pending" && (
                      <span className="ml-1.5 rounded-full bg-white/70 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-amber-800">
                        Pending
                      </span>
                    )}
                  </th>
                ))}
                {columns.map((column) => (
                  <th key={column.id} className={cn(cellBase, headCell, "min-w-36 text-center font-bold")}>
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
                  <th key={label} title={title} className={cn(cellBase, headCell, "text-center font-bold")}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y font-mono tabular-nums">
              {/* "Bill" row: each column's total, like the sheet */}
              <tr className="bg-zinc-50">
                <th scope="row" className={cn(cellBase, stickyCol, "bg-zinc-50 text-left font-sans font-medium italic")}>
                  Bill
                </th>
                {bills.map((bill) => (
                  <td key={bill.id} className={cn(cellBase, "text-center")}>
                    {bill.paidBy ? (
                      // Visits are logged on the Helper tab; the total is what was handed over.
                      <TotalLink href={`${base}/helper`} name={bill.name} amount={bill.total} tab="Helper" />
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
                    <EmailedNote bill={bill} />
                    {bill.status === "pending" && editable && <PendingBillActions bill={bill} />}
                  </td>
                ))}
                {columns.map((column) => (
                  <td key={column.id} className={cn(cellBase, "text-center")}>
                    {/* The total is the advances logged into this column: it opens the Advances
                        Log filtered to them. Not for an empty column (advances are always > 0,
                        so ₱0.00 means none): nothing to see. Except, for PA, a Manual one that's
                        over or short: the missing advance is logged there. */}
                    {column.total !== 0 || (editable && column.difference !== 0) ? (
                      <TotalLink
                        href={`${base}/advances?column=${column.id}`}
                        name={column.name}
                        amount={column.total}
                        tab="Advances"
                      />
                    ) : (
                      <span className="font-semibold">{formatPHP(column.total)}</span>
                    )}
                    {column.difference !== 0 && (
                      <div className="mt-1 font-sans text-[11px] font-medium text-rose-600">
                        {formatPHP(Math.abs(column.difference))} {column.difference > 0 ? "over" : "short"}
                      </div>
                    )}
                  </td>
                ))}
                <td colSpan={5} />
                <td className={finalCol} />
              </tr>

              {members.map((member) => {
                const row = rowOf.get(member.id);
                // The row of whoever the page is drawn for gets a light tint, so it's easy to find.
                const mine = member.id === viewer.memberId;
                return (
                  <tr key={member.id} className={cn("group", mine ? "bg-sky-50" : "hover:bg-zinc-50")}>
                    <th
                      scope="row"
                      className={cn(
                        cellBase,
                        stickyCol,
                        "text-left font-sans font-medium",
                        mine ? "bg-sky-50" : "bg-white group-hover:bg-zinc-50",
                      )}
                    >
                      <span className="flex items-center">
                        <MemberMark dotClass={member.dotClass} emoji={member.emoji} />
                        <Squeeze className={squeezeGap}>
                          {member.name}
                          {member.isCollector && (
                            <span className="rounded-full bg-zinc-100 px-1.5 text-[11px] font-normal text-zinc-600">collector</span>
                          )}
                          <YouTag memberId={member.id} />
                        </Squeeze>
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
                    <td className={cn(cellBase, finalCol, "text-center")}>{row ? <Balance amount={row.balance} /> : "—"}</td>
                  </tr>
                );
              })}

              {showBudget && (
                <tr className="group hover:bg-zinc-50">
                  <th scope="row" className={cn(cellBase, stickyCol, "bg-white group-hover:bg-zinc-50 text-left font-sans font-medium")}>
                    <span className="flex items-center">
                      <HouseBudgetMark emoji={view.houseBudgetEmoji} />
                      <Squeeze className={squeezeGap}>{HOUSE_BUDGET_LABEL}</Squeeze>
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
                  <td className={cn(cellBase, finalCol, "text-center")}>
                    <HouseBudgetBalance amount={budget.balance} />
                  </td>
                </tr>
              )}

              {(["dueDate", "paidOn"] as const).map((field) => (
                <tr key={field} className="bg-zinc-50 font-sans">
                  <th scope="row" className={cn(cellBase, stickyCol, "bg-zinc-50 text-left font-medium text-zinc-600")}>
                    {field === "dueDate" ? <ScrollLabel full="Due date" short="Due" /> : <ScrollLabel full="Date paid" short="Paid" />}
                  </th>
                  {bills.map((bill) => (
                    <td key={bill.id} className={cn(cellBase, "text-center")}>
                      {hasDates(bill) && <DateCell bill={bill} field={field} editable={editable} />}
                    </td>
                  ))}
                  <td colSpan={columns.length} />
                  <td colSpan={5} />
                  <td className={finalCol} />
                </tr>
              ))}
            </tbody>

            <tfoot className="font-mono tabular-nums">
              <tr className="border-t border-amber-300 bg-amber-50 font-semibold">
                <th scope="row" className={cn(footCell, stickyCol, "bg-amber-50 text-left font-sans")}>
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
                <td className={cn(footCell, "border-l border-amber-200 text-center")}>
                  {formatPHP(sum((r) => r.balance) + budgetIn(budget.balance))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 rounded-full bg-white/90 p-0.5 opacity-0 shadow-xs transition-opacity peer-data-more-right:opacity-100"
        >
          <ChevronRight className="size-5 text-zinc-500" />
        </div>
      </div>

      <ExplainerCards />
    </div>
  );
}

/**
 * Text in the name column that squeezes out of the way once the table is scrolled sideways on a
 * phone, so the column narrows to the marks and more of the table fits; `reveal` does the
 * opposite, for a short label taking its place. The full text stays for screen readers (only
 * clipped and faded). It animates max-width, which needs the real width to animate to: names
 * can be long, so it's measured into --squeeze-w rather than capped. Until then max-width falls
 * back to none, so the first paint is the full label. A flex item, never inline: an
 * overflow-hidden inline-block would sit on its bottom edge, above the text line.
 */
function Squeeze({
  reveal = false,
  className,
  children,
}: {
  reveal?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    // Rounded up: offsetWidth rounds down and could clip the last letter.
    const measure = () => box.style.setProperty("--squeeze-w", `${Math.ceil(content.getBoundingClientRect().width)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  return (
    <span
      ref={outer}
      aria-hidden={reveal || undefined}
      className={cn(
        "block shrink-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin-left] duration-300 ease-out motion-reduce:transition-none",
        reveal
          ? "max-w-0 opacity-0 max-sm:group-data-scrolled-left/scroller:max-w-(--squeeze-w) max-sm:group-data-scrolled-left/scroller:opacity-100"
          : "max-w-(--squeeze-w) max-sm:group-data-scrolled-left/scroller:max-w-0 max-sm:group-data-scrolled-left/scroller:opacity-0",
        className,
      )}
    >
      {/* w-max: keeps its full width while the outer one is squeezed, so it can be measured. */}
      <span ref={inner} className="flex w-max items-center gap-2">
        {children}
      </span>
    </span>
  );
}

/** A label that swaps for a shorter one once scrolled on a phone ("OCT 2026" → "OCT"). */
function ScrollLabel({ full, short }: { full: string; short: string }) {
  return (
    <span className="flex items-center">
      <Squeeze>{full}</Squeeze>
      <Squeeze reveal>{short}</Squeeze>
    </span>
  );
}

/**
 * A total that comes from another tab (the Helper's visits, a column's advances): a link there,
 * with a note saying so. The link's label says where it goes, so the note is hidden from
 * screen readers.
 */
function TotalLink({ href, name, amount, tab }: { href: string; name: string; amount: number; tab: string }) {
  return (
    <>
      <Link
        href={href}
        aria-label={`${name} total ${formatPHP(amount)}, open the ${tab} tab`}
        className="font-semibold underline decoration-dotted underline-offset-4 hover:text-amber-700"
      >
        {formatPHP(amount)}
      </Link>
      <div aria-hidden className="mt-1 font-sans text-[11px] text-muted-foreground">
        from the {tab} tab
      </div>
    </>
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
      inputClassName="h-8 w-28 pr-2 text-right font-mono text-sm max-md:w-32"
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
      <label className="relative inline-flex h-7 w-24 items-center justify-center rounded-md border border-transparent text-xs text-zinc-600 focus-within:border-amber-500 hover:border-input pointer-coarse:h-9">
        <span className={cn(!value && "text-muted-foreground")}>{label}</span>
        <input
          key={value}
          type="date"
          name="value"
          defaultValue={value}
          aria-label={`${bill.name} ${field === "dueDate" ? "due date" : "date paid"}`}
          disabled={pending}
          // Invisible, but 16px on phones anyway: iPhone zooms into a smaller input when tapped.
          className="absolute inset-0 cursor-pointer opacity-0 max-md:text-base"
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
      {state?.ok === false && (
        <p role="alert" className="text-[11px] text-destructive">
          {state.error}
        </p>
      )}
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
  // On a phone: one row that swipes sideways, edge to edge (-mx-4 undoes <main>'s px-4), with the
  // next card peeking in to show there's more. py-1 keeps the cards' shadow from being clipped.
  return (
    <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:p-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
      {cards.map(({ icon: Icon, title, body, href }) => (
        <Link
          key={title}
          href={`/how-it-works${href}`}
          className="w-[85%] shrink-0 snap-start rounded-xl border bg-white p-4 shadow-xs transition-colors hover:border-amber-300 sm:w-auto"
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
