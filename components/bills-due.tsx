"use client";

// The admin's banner of bills still to pay the billers (docs/features/reminders.md → Biller due
// dates). Folded to one line (how many, the next one and how soon); tap it to open the list: each
// bill, when it's due, and a "Paid today" button that sets its Date paid — which is what stops
// the banner and the morning reminders. A Bill inbox email links to the inbox.

import { Check, ChevronDown, Receipt } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { markBillPaid } from "@/app/periods/[year]/[month]/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { dayLabel, monthLabel } from "@/lib/format";
import { BILL_DUE_DAYS, dueIn, type BillDue } from "@/lib/reminders";
import { cn } from "@/lib/utils";

export function BillsDue({ bills, inboxHref }: { bills: BillDue[]; inboxHref: string }) {
  // Soonest first (billsDue), so the first is the one to pay next.
  const [next] = bills;
  const urgent = bills.some((b) => b.daysLeft <= BILL_DUE_DAYS.soon);
  return (
    // <details>: the browser's own fold, so it opens with a tap, Enter or Space, and stays open
    // after "Paid today" refreshes the page.
    <details
      className={cn(
        "group rounded-xl border text-sm",
        // The same two looks as the other month notices (components/month-notices.tsx).
        urgent ? "border-amber-300 bg-amber-50 text-amber-900" : "border-zinc-200 bg-zinc-50 text-zinc-700",
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Receipt className="size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Bills to pay</p>
          <p className="truncate text-xs opacity-80">
            {bills.length} bill{bills.length === 1 ? "" : "s"} · next: {next.name}, due {dayLabel(next.dueDate)}
          </p>
        </div>
        <DuePill daysLeft={next.daysLeft} />
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-4 pb-4">
        <p className="text-xs opacity-80">Once you&apos;ve paid one, tap Paid today and its reminders stop.</p>
        <ul className="mt-2 divide-y divide-black/5 rounded-lg border border-black/10 bg-white/80 text-zinc-800">
          {bills.map((bill) => (
            <BillDueRow key={`${bill.source}-${bill.source === "bill" ? bill.id : bill.emailId}`} bill={bill} inboxHref={inboxHref} />
          ))}
        </ul>
      </div>
    </details>
  );
}

/** "in 3 days" / "today" / "2 days overdue": grey, amber within a few days, red from the due day. */
function DuePill({ daysLeft }: { daysLeft: number }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        daysLeft <= 0
          ? "bg-red-100 text-red-800"
          : daysLeft <= BILL_DUE_DAYS.soon
            ? "bg-amber-100 text-amber-900"
            : "bg-zinc-100 text-zinc-700",
      )}
    >
      {dueIn(daysLeft)}
    </span>
  );
}

function BillDueRow({ bill, inboxHref }: { bill: BillDue; inboxHref: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const month = bill.year && bill.month ? `${monthLabel(bill.year, bill.month).split(" ")[0]} bill` : "Bill";
  const note =
    bill.source === "inbox" ? "in the Bill inbox" : bill.pending ? "pending, confirm it on the Split Table" : null;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        {bill.source === "bill" ? (
          <Link href={`/periods/${bill.year}/${bill.month}`} className="font-medium hover:underline">
            {bill.name}
          </Link>
        ) : (
          <span className="font-medium">{bill.name}</span>
        )}
        <p className="text-xs text-muted-foreground">
          {month} · due {dayLabel(bill.dueDate)}
          {note && ` · ${note}`}
        </p>
      </div>
      <DuePill daysLeft={bill.daysLeft} />
      {bill.source === "bill" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await markBillPaid(bill.id);
              setError(result?.ok === false ? result.error : null);
            })
          }
        >
          <Check />
          {pending ? "Saving…" : "Paid today"}
        </Button>
      ) : (
        <Link href={inboxHref} className={buttonVariants({ size: "sm", variant: "outline" })}>
          Bill inbox
        </Link>
      )}
      {error && (
        <p role="alert" className="w-full text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}
