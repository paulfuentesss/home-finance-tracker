"use client";

import { Check, Lock, LockOpen, Pencil, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  cancelPayment,
  closeMonth,
  confirmPayment,
  deletePayment,
  rejectPayment,
  reopenMonth,
  type ActionState,
} from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { EditPaymentDialog, RecordPaymentDialog, SubmitPaymentDialog } from "@/components/entry-dialogs";
import { Pair } from "@/components/member-pair";
import { ProofThumbs } from "@/components/receipts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCanEdit, useIsPreviewing, useViewer } from "@/components/viewer-context";
import { dateLabel, monthLabel } from "@/lib/format";
import { formatPHP, sumCentavos, type Centavos } from "@/lib/money";
import { canCancelPayment, canSubmitPayment, isAdmin } from "@/lib/permissions";
import type { PeriodView, ViewPayment, ViewReceipt } from "@/lib/periods";
import { suggestedPayments } from "@/lib/settlement";
import { cn } from "@/lib/utils";

// Tab: Settle Up. Who still owes whom (one tap records the payment, or a housemate's "I paid"),
// the payments this month — housemates' waiting for PA to confirm — and closing / reopening the
// month (docs/settlement-rules.md, docs/features/settle-up.md).
export function SettleUp({ view, receipts }: { view: PeriodView; receipts: ViewReceipt[] }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <WaitingForYou view={view} receipts={receipts} />
        <WhoStillOwes view={view} />
        <PaymentsList view={view} receipts={receipts} />
      </div>
      <MonthLock view={view} />
    </div>
  );
}

/** What a member has sent with "I paid" that still waits for PA. */
function waitingFrom(view: PeriodView, memberId: number): Centavos {
  return sumCentavos(
    view.payments.filter((p) => p.status === "pending" && p.fromMemberId === memberId).map((p) => p.amount),
  );
}

/** Whether the viewer may send an "I paid" here: a member in the latest, open month. */
function useCanSendPayment(view: PeriodView): boolean {
  const viewer = useViewer();
  const collector = view.members.find((m) => m.isCollector) ?? null;
  return (
    view.period.status === "open" &&
    view.isLatest &&
    view.members.some((m) => m.id === viewer.memberId) &&
    canSubmitPayment(viewer, collector?.id ?? null)
  );
}

/** PA: housemates' "I paid" waiting for a look at the bank — at the top, so they're not missed. */
function WaitingForYou({ view, receipts }: { view: PeriodView; receipts: ViewReceipt[] }) {
  const editable = useCanEdit(view.period.status);
  const waiting = view.payments.filter((p) => p.status === "pending");
  if (!editable || waiting.length === 0) return null;
  return (
    <section aria-labelledby="waiting-for-you" className="rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
      <h2 id="waiting-for-you" className="text-lg font-semibold text-amber-950">
        Waiting for you ({waiting.length})
      </h2>
      <p className="mt-1 text-sm text-amber-900">
        Check your bank, then confirm each payment that arrived. Until then it doesn&apos;t count.
      </p>
      <ul className="mt-3 divide-y divide-amber-200">
        {waiting.map((p) => (
          <PaymentRow key={p.id} view={view} payment={p} receipts={receipts} />
        ))}
      </ul>
    </section>
  );
}

function WhoStillOwes({ view }: { view: PeriodView }) {
  // PA records payments; a housemate sends their own with "I paid" (in the latest, open month).
  const editable = useCanEdit(view.period.status);
  const viewer = useViewer();
  const canSend = useCanSendPayment(view);
  const memberOf = new Map(view.members.map((m) => [m.id, m]));
  const collector = view.members.find((m) => m.isCollector) ?? null;
  const balances = view.rows.map((r) => ({ memberId: r.memberId, balance: r.balance }));
  const suggestions = suggestedPayments(balances, collector?.id ?? null);
  const settled = view.rows.filter((r) => r.balance === 0 && r.memberId !== collector?.id);
  const collectorLeft = view.rows.find((r) => r.memberId === collector?.id)?.balance ?? 0;

  return (
    <section aria-labelledby="who-still-owes" className="rounded-xl border bg-white p-4 shadow-xs sm:p-5">
      <h2 id="who-still-owes" className="text-lg font-semibold">
        Who still owes
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Everyone settles with {collector?.name ?? "the collector"}.{" "}
        {editable
          ? "Record a payment when money changes hands; it comes off both people's Final. Housemates can send theirs with “I paid” for you to confirm."
          : canSend
            ? `Paid ${collector?.name ?? "the collector"}? Tap “I paid” and attach the screenshot of your transfer. It comes off your Final once ${collector?.name ?? "they"} confirms it.`
            : `${collector?.name ?? "The collector"} records each payment when money changes hands; it comes off both people's Final.`}
      </p>

      {view.issue ? (
        <p className="mt-4 text-sm text-muted-foreground">
          The amounts can&apos;t be worked out until the problem above is fixed.
        </p>
      ) : suggestions.length === 0 ? (
        <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
          Everyone is settled this month.
          {collectorLeft !== 0 && (
            <span className="block text-xs font-normal text-emerald-700">
              {collector?.name}&apos;s Final is {formatPHP(Math.abs(collectorLeft))}: what the shared columns
              don&apos;t add up to.
            </span>
          )}
        </p>
      ) : (
        <ul className="mt-4 divide-y">
          {suggestions.map((s) => {
            const from = memberOf.get(s.fromMemberId)!;
            const to = memberOf.get(s.toMemberId)!;
            // Only a housemate's payment to the collector can be waiting.
            const waiting = s.toMemberId === collector?.id ? waitingFrom(view, s.fromMemberId) : 0;
            const own = canSend && s.fromMemberId === viewer.memberId;
            return (
              // Phone: who over the amount, a small button on the right. Wider: one line.
              <li key={`${s.fromMemberId}-${s.toMemberId}`} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="space-y-0.5 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:space-y-0">
                    <Pair from={from} to={to} />
                    <span className="block font-mono font-semibold tabular-nums text-rose-600">{formatPHP(s.amount)}</span>
                  </div>
                  {waiting > 0 && (
                    <p className="text-xs text-amber-700">
                      {formatPHP(waiting)} sent, waiting for {collector?.name}
                      {/* So PA confirms it rather than recording the same money again. */}
                      {editable && " — confirm it above instead of recording it again"}
                    </p>
                  )}
                </div>
                {editable && (
                  <RecordPaymentDialog
                    view={view}
                    prefill={s}
                    label={
                      <>
                        Record<span className="hidden sm:inline"> payment</span>
                      </>
                    }
                    variant={waiting > 0 ? "outline" : "default"}
                    className="shrink-0"
                  />
                )}
                {own && <SubmitPaymentDialog view={view} owed={s.amount} waiting={waiting} className="shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}

      {!view.issue && settled.length > 0 && suggestions.length > 0 && (
        <p className="mt-2 border-t pt-3 text-xs text-muted-foreground">
          <span className="font-medium text-zinc-600">Settled:</span>{" "}
          {settled.map((r) => memberOf.get(r.memberId)?.name).join(", ")}
        </p>
      )}

      {/* No rows to tap (everyone settled, or the numbers can't be worked out): still a way to
          record a payment. With rows, each row's form already lets PA change who paid whom. */}
      {editable && (view.issue || suggestions.length === 0) && (
        <RecordPaymentDialog view={view} label="Record a payment" variant="outline" className="mt-3" />
      )}
    </section>
  );
}

function PaymentsList({ view, receipts }: { view: PeriodView; receipts: ViewReceipt[] }) {
  // PA records payments (in an open month); housemates' own come from "I paid".
  return (
    <section aria-labelledby="payments-this-month" className="rounded-xl border bg-white p-4 shadow-xs sm:p-5">
      <h2 id="payments-this-month" className="text-lg font-semibold">
        Payments this month
      </h2>

      {view.payments.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No payments recorded yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y">
          {view.payments.map((p) => (
            <PaymentRow key={p.id} view={view} payment={p} receipts={receipts} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One payment: who paid whom, its status (a housemate's waiting or rejected "I paid"), its proofs
 * (only for PA and the two people in it — the list is already filtered), and what the viewer may
 * do: PA confirms, rejects, edits or deletes; the payer cancels their own while it waits or was
 * rejected.
 */
function PaymentRow({ view, payment: p, receipts }: { view: PeriodView; payment: ViewPayment; receipts: ViewReceipt[] }) {
  const editable = useCanEdit(view.period.status);
  const viewer = useViewer();
  const previewing = useIsPreviewing();
  const [editing, setEditing] = useState(false);
  const memberOf = new Map(view.members.map((m) => [m.id, m]));
  const from = memberOf.get(p.fromMemberId);
  const to = memberOf.get(p.toMemberId);
  const label = `${from?.name ?? "Someone"} → ${to?.name ?? "someone"}`;
  const proofs = receipts.filter((r) => r.paymentId === p.id);
  const canCancel =
    view.period.status === "open" && !isAdmin(viewer) && p.status !== "confirmed" && canCancelPayment(viewer, p);

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0 space-y-1">
        {from && to && <Pair from={from} to={to} />}
        <p className="text-xs text-muted-foreground">
          {dateLabel(p.paidOn)}
          {p.note && <> · {p.note}</>}
        </p>
        {p.status === "pending" && (
          <p className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Waiting for {to?.name ?? "PA"}
          </p>
        )}
        {p.status === "rejected" && (
          <p className="text-xs text-rose-700">
            <span className="font-medium">Rejected:</span> {p.rejectedReason}
          </p>
        )}
        <ProofThumbs receipts={proofs} label={label} status={view.period.status} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        <span
          className={cn(
            "mr-1 font-mono text-sm font-semibold tabular-nums",
            p.status === "rejected" && "text-muted-foreground line-through",
          )}
        >
          {formatPHP(p.amount)}
        </span>
        {editable && p.status === "pending" && (
          <>
            <DecideButton label="Confirm" icon={<Check />} action={() => confirmPayment(p.id)} />
            <RejectButton payment={p} label={label} />
          </>
        )}
        {editable && (
          <>
            {p.status !== "rejected" && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Edit payment"
                className="text-muted-foreground"
                onClick={() => setEditing(true)}
              >
                <Pencil />
              </Button>
            )}
            <ConfirmDeleteButton
              label="Delete payment"
              title="Delete this payment?"
              description={`${label}, ${formatPHP(p.amount)}. ${p.status === "confirmed" ? "Both Finals go back to what they were before it, and any" : "Any"} proof attached to it is deleted.`}
              onConfirm={() => deletePayment(p.id)}
            />
          </>
        )}
        {canCancel && !previewing && (
          <ConfirmDeleteButton
            label="Cancel this payment"
            title="Cancel this payment?"
            description={`${formatPHP(p.amount)} to ${to?.name ?? "PA"}, and its screenshot, are removed. Send it again with “I paid” if you need to.`}
            confirmLabel="Cancel payment"
            onConfirm={() => cancelPayment(p.id)}
          />
        )}
      </div>
      {editable && <EditPaymentDialog view={view} payment={editing ? p : null} onClose={() => setEditing(false)} />}
    </li>
  );
}

/** A small button that runs a payment action, showing its error under it. */
function DecideButton({
  label,
  icon,
  action,
}: {
  label: string;
  icon: React.ReactNode;
  action: () => Promise<ActionState>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await action();
            setError(result?.ok === false ? result.error : null);
          })
        }
      >
        {icon}
        {pending ? "Working…" : label}
      </Button>
      {error && (
        <span role="alert" className="mt-1 max-w-48 text-right text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}

/** Reject, with the reason the housemate will see ("Not in my GCash"). */
function RejectButton({ payment, label }: { payment: ViewPayment; label: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <X />
        Reject
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this payment?</DialogTitle>
          <DialogDescription>
            {label}, {formatPHP(payment.amount)}. It stays in the list as rejected, with your reason, and never
            counts. They can cancel it and send it again.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await rejectPayment(payment.id, reason);
              if (result?.ok) setOpen(false);
              else if (result) setError(result.error);
            });
          }}
        >
          <Input
            aria-label="Why it's rejected"
            placeholder="Not in my GCash yet"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={120}
            required
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Keep waiting</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Rejecting…" : "Reject payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MonthLock({ view }: { view: PeriodView }) {
  const { year, month, status, closedOn } = view.period;
  const label = monthLabel(year, month);
  const next = view.next ? monthLabel(view.next.year, view.next.month) : null;
  const nameOf = new Map(view.members.map((m) => [m.id, m.name]));
  // Only PA closes and reopens months; everyone else sees where the month stands.
  const admin = isAdmin(useViewer());

  if (status === "closed") {
    return (
      <section className="rounded-xl border bg-white p-4 shadow-xs sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Lock className="size-4 text-zinc-500" />
          {label} is closed
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {closedOn && <>Closed on {dateLabel(closedOn)}. </>}
          Nothing in it can be changed, and everyone&apos;s Final is saved
          {next ? ` as ${next}'s Prev Month Unsettled` : " for next month"}.
        </p>
        {admin && (
          <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-xs text-muted-foreground">
            Back up the database after closing a month: <code className="font-mono">npm run db:backup</code>
          </p>
        )}
        {admin && (
          <div className="mt-4">
            <ConfirmAction
              trigger={
                <>
                  <LockOpen />
                  Reopen {label}
                </>
              }
              check={view.canReopen}
              title={`Reopen ${label}?`}
              description={`It becomes editable again${next ? `, and ${next}'s Prev Month Unsettled follows it live again` : ""}.`}
              confirmLabel={`Reopen ${label}`}
              action={() => reopenMonth(view.period.id)}
            />
          </div>
        )}
      </section>
    );
  }

  if (!admin) {
    return (
      <section className="rounded-xl border bg-white p-4 shadow-xs sm:p-5">
        <h2 className="text-lg font-semibold">{label} is open</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The admin closes the month once it&apos;s settled. Anything still unpaid then carries over
          {next ? ` to ${next}` : " to next month"} as Prev Month Unsettled.
        </p>
      </section>
    );
  }

  const unsettled = view.rows.filter((r) => r.balance !== 0);
  // Bills land in the month they're for, which usually ends before they arrive.
  const emptyBills = view.bills.filter((b) => b.total === 0);
  const offColumns = view.columns.filter((c) => c.difference !== 0);

  return (
    <section className="rounded-xl border bg-white p-4 shadow-xs sm:p-5">
      <h2 className="text-lg font-semibold">Close {label}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Locks the month so nothing in it can change. Anything still unpaid carries over
        {next ? ` to ${next}` : " to next month"} as Prev Month Unsettled. You can reopen it later.
      </p>
      <div className="mt-4">
        <ConfirmAction
          trigger={
            <>
              <Lock />
              Close {label}
            </>
          }
          check={view.canClose}
          title={`Close ${label}?`}
          description="Nothing in it can be changed until it's reopened."
          confirmLabel={`Close ${label}`}
          action={() => closeMonth(view.period.id)}
        >
          {unsettled.length > 0 ? (
            <div className="text-sm">
              <p className="font-medium">Still unsettled (carries over{next ? ` to ${next}` : ""}):</p>
              <ul className="mt-1 space-y-0.5">
                {unsettled.map((r) => (
                  <li key={r.memberId} className="flex justify-between gap-3">
                    <span>{nameOf.get(r.memberId)}</span>
                    <span className={cn("font-mono tabular-nums", r.balance > 0 ? "text-rose-600" : "text-emerald-700")}>
                      {formatPHP(Math.abs(r.balance))} {r.balance > 0 ? "to pay" : "to receive"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-emerald-700">Everyone is settled.</p>
          )}
          {(emptyBills.length > 0 || offColumns.length > 0) && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
              {emptyBills.length > 0 && (
                <li>
                  Still at ₱0.00: {emptyBills.map((b) => b.name).join(", ")}. If the bill hasn&apos;t arrived yet, wait:
                  once {label} is closed, its emailed bill goes to the Bill inbox instead.
                </li>
              )}
              {offColumns.map((c) => (
                <li key={c.id}>
                  {c.name} is {formatPHP(Math.abs(c.difference))} {c.difference > 0 ? "over" : "short"}.
                </li>
              ))}
            </ul>
          )}
        </ConfirmAction>
      </div>
    </section>
  );
}

/** A button that confirms, then runs a month action. Disabled, with the reason, when `check` fails. */
function ConfirmAction({
  trigger,
  check,
  title,
  description,
  confirmLabel,
  action,
  children,
}: {
  trigger: React.ReactNode;
  check: { ok: boolean; reason?: string };
  title: string;
  description: string;
  confirmLabel: string;
  action: () => Promise<ActionState>;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!check.ok) {
    return (
      <div className="space-y-2">
        <Button variant="outline" disabled className="w-full sm:w-auto">
          {trigger}
        </Button>
        <p className="text-xs text-muted-foreground">{check.reason}</p>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setError(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline" className="w-full sm:w-auto" />}>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await action();
                if (result?.ok) setOpen(false);
                else if (result) setError(result.error);
              })
            }
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
