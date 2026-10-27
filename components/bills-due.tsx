"use client";

// The admin's banner of bills still to pay the billers (docs/features/reminders.md → Biller due
// dates): each bill, when it's due, and a "Paid today" button that sets its Date paid — which
// is what stops the banner and the morning reminders. A Bill inbox email links to the inbox.

import { Check } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { markBillPaid } from "@/app/periods/[year]/[month]/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { dayLabel, monthLabel } from "@/lib/format";
import { BILL_DUE_DAYS, dueIn, type BillDue } from "@/lib/reminders";
import { cn } from "@/lib/utils";

export function BillsDueList({ bills, inboxHref }: { bills: BillDue[]; inboxHref: string }) {
  return (
    <>
      <p className="font-medium">Bills to pay</p>
      <p className="text-xs opacity-80">Once you&apos;ve paid one, tap Paid today and its reminders stop.</p>
      <ul className="mt-3 max-w-2xl divide-y divide-black/5 rounded-lg border border-black/10 bg-white/80 text-zinc-800">
        {bills.map((bill) => (
          <BillDueRow key={`${bill.source}-${bill.source === "bill" ? bill.id : bill.emailId}`} bill={bill} inboxHref={inboxHref} />
        ))}
      </ul>
    </>
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
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
          bill.daysLeft <= 0
            ? "bg-red-100 text-red-800"
            : bill.daysLeft <= BILL_DUE_DAYS.soon
              ? "bg-amber-100 text-amber-900"
              : "bg-zinc-100 text-zinc-700",
        )}
      >
        {dueIn(bill.daysLeft)}
      </span>
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
