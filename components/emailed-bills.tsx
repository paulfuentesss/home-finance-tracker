"use client";

// Bills that arrive by email (docs/settlement-rules.md → "Email-imported bills"): the Confirm /
// Discard buttons under a pending bill in the Split Table, and the Bill inbox for emails
// that couldn't be placed.

import { Check, Inbox, Info, RotateCw, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  confirmBill,
  discardEmailBill,
  dismissBillEmail,
  retryBillEmail,
  type ActionState,
} from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { dateLabel, monthLabel } from "@/lib/format";
import { formatPHP, type Centavos } from "@/lib/money";
import type { ViewBill } from "@/lib/periods";

/** Under an emailed bill's amount: a small "From email" tag; its popover shows what the email
 * said and the payment fee that was added. */
export function EmailedNote({ bill }: { bill: ViewBill }) {
  if (!bill.emailed) return null;
  const { amount, fee, feeNote } = bill.emailed;
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        aria-label={`Where the ${bill.name} amount came from`}
        className="mx-auto mt-1 flex items-center gap-1 rounded font-sans text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        From email
        <Info className="size-3" />
      </PopoverTrigger>
      <PopoverContent className="w-64 font-sans">
        <PopoverTitle>From email</PopoverTitle>
        <ul className="divide-y text-xs">
          <li className="flex justify-between gap-3 py-1.5">
            <span>Emailed bill</span>
            <span className="shrink-0 font-mono whitespace-nowrap tabular-nums">{formatPHP(amount)}</span>
          </li>
          {fee > 0 && (
            <li className="flex justify-between gap-3 py-1.5">
              <span>{feeNote ?? "Payment fee"}</span>
              {/* Long fee notes wrap; the amount never does. */}
              <span className="shrink-0 font-mono whitespace-nowrap tabular-nums">+ {formatPHP(fee)}</span>
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Under a pending bill's amount: it isn't counted until someone confirms it. */
export function PendingBillActions({ bill }: { bill: ViewBill }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionState>) =>
    startTransition(async () => {
      const result = await action();
      setError(result?.ok === false ? result.error : null);
    });

  return (
    <div className="mt-1.5 font-sans">
      <p className="text-[11px] font-medium text-amber-700">Not counted until confirmed</p>
      <div className="mt-1 flex items-center justify-center gap-1">
        <Button size="xs" disabled={pending} onClick={() => run(() => confirmBill(bill.id))}>
          <Check />
          {pending ? "Saving…" : "Confirm"}
        </Button>
        <ConfirmDeleteButton
          label={`Discard the emailed ${bill.name} bill`}
          title={`Discard the emailed ${bill.name} bill?`}
          description={`${bill.name} goes back to ₱0.00 so you can type the amount yourself. The email won't be imported again.`}
          confirmLabel="Discard"
          onConfirm={() => discardEmailBill(bill.id)}
        />
      </div>
      {error && (
        <p role="alert" className="mt-1 max-w-36 text-[11px] whitespace-normal text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export interface InboxEmail {
  id: number;
  subject: string;
  fromAddress: string;
  /** "YYYY-MM-DD", Manila time. */
  receivedOn: string;
  snippet: string;
  reason: string | null;
  amount: Centavos | null;
  /** Payment fee that will be added (0 when none). */
  fee: Centavos;
  billYear: number | null;
  billMonth: number | null;
  /** Parsed, so Retry can place it once the month or column is ready. */
  canRetry: boolean;
}

/** Emails that didn't land in a Split Table, with why and what to do. */
export function BillInbox({ emails }: { emails: InboxEmail[] }) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-xs">
      <div className="flex items-center gap-2">
        <Inbox className="size-5 text-muted-foreground" />
        <h2 className="text-base font-semibold">Bill Inbox</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Bill emails that couldn&apos;t go straight into a month. Fix what the note says and Retry, or Dismiss.
      </p>
      <ul className="mt-4 space-y-2">
        {emails.map((email) => (
          <InboxRow key={email.id} email={email} />
        ))}
        {emails.length === 0 && (
          <li className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing waiting. Emailed bills show up as Pending in their month.
          </li>
        )}
      </ul>
    </section>
  );
}

function InboxRow({ email }: { email: InboxEmail }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionState>) =>
    startTransition(async () => {
      const result = await action();
      setError(result?.ok === false ? result.error : null);
    });

  return (
    <li className="rounded-lg border bg-zinc-50/60 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-semibold">{email.subject}</span>
        {email.amount !== null && (
          <span className="font-mono tabular-nums">
            {formatPHP(email.amount)}
            {email.fee > 0 && <span className="font-sans text-muted-foreground"> + {formatPHP(email.fee)} fee</span>}
            {email.billYear && email.billMonth && (
              <span className="font-sans text-muted-foreground"> · {monthLabel(email.billYear, email.billMonth)}</span>
            )}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {email.fromAddress} · {dateLabel(email.receivedOn)}
      </p>
      {email.reason && <p className="mt-1.5 text-amber-800">{email.reason}</p>}
      {email.snippet && <p className="mt-1.5 line-clamp-3 text-xs text-zinc-600">{email.snippet}</p>}
      {error && error !== email.reason && (
        <p role="alert" className="mt-1.5 text-destructive">
          {error}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        {email.canRetry && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => retryBillEmail(email.id))}>
            <RotateCw />
            Retry
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => dismissBillEmail(email.id))}>
          <X />
          Dismiss
        </Button>
      </div>
    </li>
  );
}
