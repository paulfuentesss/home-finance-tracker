"use client";

import { Check, ListChevronsDownUp, ListChevronsUpDown, Lock, LockOpen, Mail, Pencil, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  cancelPayment,
  closeMonth,
  confirmPayment,
  deletePayment,
  emailPayables,
  rejectPayment,
  reopenMonth,
  type ActionState,
} from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { EditPaymentDialog, RecordPaymentDialog, SubmitPaymentDialog } from "@/components/entry-dialogs";
import { Pair, partyName, partyView } from "@/components/member-pair";
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
import { HOUSE_BUDGET_LABEL } from "@/lib/household-config";
import { formatPHP, sumCentavos, type Centavos } from "@/lib/money";
import { canCancelPayment, canSubmitPayment, isAdmin } from "@/lib/permissions";
import type { PeriodView, ViewPayment, ViewReceipt } from "@/lib/periods";
import type { EmailStatus } from "@/lib/reminder-status";
import { REMINDER_DAYS, type MonthEndReminder } from "@/lib/reminders";
import { HOUSE_BUDGET, suggestedPayments } from "@/lib/settlement";
import { COMPACT_COOKIE } from "@/lib/settle-up-view";
import { cn } from "@/lib/utils";

// Tab: Settle Up. Who still owes whom (one tap records the payment, or a housemate's "I paid"),
// the payments this month — housemates' waiting for PA to confirm — and closing / reopening the
// month (docs/settlement-rules.md, docs/features/settle-up.md).
export function SettleUp({
  view,
  receipts,
  emailStatus,
  compact,
}: {
  view: PeriodView;
  receipts: ViewReceipt[];
  /** The admin's bill-email box (null for anyone else). */
  emailStatus: EmailStatus | null;
  /** This phone picked Compact for Who still owes (its cookie, lib/settle-up-view.ts). */
  compact: boolean;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <WaitingForYou view={view} receipts={receipts} />
        <WhoStillOwes view={view} compact={compact} />
        <PaymentsList view={view} receipts={receipts} />
      </div>
      <div className="space-y-6">
        {emailStatus && <EmailBill view={view} status={emailStatus} />}
        <MonthLock view={view} />
      </div>
    </div>
  );
}

const REMINDER_NAMES: Record<MonthEndReminder, string> = {
  week: `${REMINDER_DAYS.week} days left`,
  three_days: `${REMINDER_DAYS.three_days} days left`,
  last_day: "Last day",
};

/**
 * The admin's "Email everyone their bill" (docs/features/reminders.md): each housemate gets their
 * own amount and a link to Settle Up. Also shows the latest month-end reminder sent, so a
 * reminder job that stopped working shows up here.
 */
function EmailBill({ view, status }: { view: PeriodView; status: EmailStatus }) {
  const admin = isAdmin(useViewer());
  if (!admin) return null;
  const label = monthLabel(view.period.year, view.period.month);
  const toEmail = status.recipients.filter(
    (r) => r.hasEmail && (r.payables?.kind === "owed" || (r.payables?.kind === "owes" && r.payables.left > 0)),
  );
  // View-only logins still to be told the bills are in (they're told once).
  const toTell = status.viewOnly.filter((v) => v.hasEmail && !v.sentOn);
  const count = toEmail.length + toTell.length;
  return (
    <section className="rounded-xl border bg-white p-4 shadow-xs sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Mail className="size-4 text-zinc-500" />
        Email everyone their bill
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Once {label}&apos;s bills are in and checked: each housemate gets an email with their own amount and a link to
        Settle Up. Nobody sees anyone else&apos;s.
        {status.viewOnly.length > 0 && " View-only logins get a short “the bills are in” note, no amounts, the first time only."}
      </p>
      {status.payablesSentAt && <p className="mt-2 text-xs text-muted-foreground">Last sent {status.payablesSentAt}.</p>}
      <ul className="mt-3 space-y-1.5 text-sm">
        {status.recipients.map((r) => (
          <li key={r.memberId} className="flex justify-between gap-3">
            <span>{r.name}</span>
            <span className="text-right">
              <RecipientState recipient={r} />
              <SentMark recipient={r} anySent={status.payablesSentAt !== null} />
            </span>
          </li>
        ))}
      </ul>
      <ViewOnlyList viewOnly={status.viewOnly} />
      {!status.live && (
        <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-xs text-muted-foreground">
          Not the live site: the emails go to your test address (<code className="font-mono">EMAIL_TEST_TO</code>), not
          the housemates, and nothing is recorded as sent.
        </p>
      )}
      <div className="mt-4">
        <ConfirmAction
          trigger={
            <>
              <Mail />
              {status.payablesSentAt ? "Email it again" : `Email ${label}'s bill`}
            </>
          }
          check={status.canSend}
          title={status.payablesSentAt ? `Email ${label}'s bill again?` : `Email ${label}'s bill?`}
          description={
            status.payablesSentAt
              ? `It was already sent ${status.payablesSentAt}. Everyone below gets it again, with today's amounts. View-only logins already told don't get the note again.`
              : "Each person below gets their own amount. Anyone settled gets nothing."
          }
          confirmLabel={count ? `Send ${count} email${count === 1 ? "" : "s"}` : "Send"}
          action={() => emailPayables(view.period.id)}
        >
          <ul className="space-y-1 text-sm">
            {status.recipients.map((r) => (
              <li key={r.memberId} className="flex justify-between gap-3">
                <span>{r.name}</span>
                <RecipientState recipient={r} />
              </li>
            ))}
          </ul>
          <ViewOnlyList viewOnly={status.viewOnly} />
        </ConfirmAction>
      </div>
      {status.lastReminder && (
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          Month-end reminder: &ldquo;{REMINDER_NAMES[status.lastReminder.kind]}&rdquo; sent {status.lastReminder.sentAt}.
        </p>
      )}
    </section>
  );
}

/** View-only logins and their "the bills are in" note: told, to be told, or no email address. */
function ViewOnlyList({ viewOnly }: { viewOnly: EmailStatus["viewOnly"] }) {
  if (viewOnly.length === 0) return null;
  return (
    <div className="mt-3 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground">View only</p>
      <ul className="mt-1.5 space-y-1.5 text-sm">
        {viewOnly.map((v) => (
          <li key={v.memberId} className="flex justify-between gap-3">
            <span>{v.name}</span>
            {!v.hasEmail ? (
              <span className="text-amber-700">no email address — won&apos;t get it</span>
            ) : v.sentOn ? (
              <span className="text-xs text-emerald-700">✓ told {v.sentOn}</span>
            ) : (
              <span className="text-muted-foreground">gets a short &ldquo;bills are in&rdquo; note</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Whether this person was sent the bill: "✓ sent Oct. 31", or "not sent" once others have been. */
function SentMark({ recipient: r, anySent }: { recipient: EmailStatus["recipients"][number]; anySent: boolean }) {
  if (r.sentOn) return <span className="block text-xs text-emerald-700">✓ sent {r.sentOn}</span>;
  // Only worth saying for someone who would get one (has an email, and something to pay or get back).
  const wouldGet =
    r.hasEmail && (r.payables?.kind === "owed" || (r.payables?.kind === "owes" && r.payables.left > 0));
  if (anySent && wouldGet) return <span className="block text-xs text-amber-700">not sent</span>;
  return null;
}

function RecipientState({ recipient: r }: { recipient: EmailStatus["recipients"][number] }) {
  if (!r.hasEmail) return <span className="text-amber-700">no email address — won&apos;t get it</span>;
  const p = r.payables;
  if (p?.kind === "owed") return <span className="font-mono tabular-nums text-emerald-700">gets {formatPHP(p.amount)} back</span>;
  if (p?.kind === "owes" && p.left > 0) {
    return (
      <span className="text-right font-mono tabular-nums text-rose-600">
        {formatPHP(p.left)} to pay
        {p.waiting > 0 && <span className="block text-xs text-amber-700">+ {formatPHP(p.waiting)} waiting</span>}
      </span>
    );
  }
  if (p?.kind === "owes") return <span className="text-muted-foreground">all sent, waiting — no email</span>;
  return <span className="text-muted-foreground">settled — no email</span>;
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

/** The latest Compact / Normal tap this visit: a page Next serves from its cache still has the old cookie value. */
let compactNow: boolean | undefined;
const ONE_YEAR = 365 * 24 * 60 * 60;

/** Remembers the choice on this phone; the page reads the cookie on its next load. */
function saveCompact(on: boolean) {
  compactNow = on;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COMPACT_COOKIE}=${on ? "1" : ""}; path=/; SameSite=Lax; max-age=${on ? ONE_YEAR : 0}${secure}`;
}

function WhoStillOwes({ view, compact }: { view: PeriodView; compact: boolean }) {
  // PA records payments; a housemate sends their own with "I paid" (in the latest, open month).
  const editable = useCanEdit(view.period.status);
  // Compact (phones only): "🐷 → 🏠", the amount and the button on one line. Wider screens ignore it.
  const [isCompact, setIsCompact] = useState(() => compactNow ?? compact);
  const viewer = useViewer();
  const canSend = useCanSendPayment(view);
  const memberOf = new Map(view.members.map((m) => [m.id, m]));
  const collector = view.members.find((m) => m.isCollector) ?? null;
  const balances = view.rows.map((r) => ({ memberId: r.memberId, balance: r.balance }));
  const held = view.houseBudget.balance;
  const suggestions = suggestedPayments(balances, collector?.id ?? null, held);
  const settled = view.rows.filter((r) => r.balance === 0 && r.memberId !== collector?.id);
  const collectorLeft = view.rows.find((r) => r.memberId === collector?.id)?.balance ?? 0;
  const collectorName = collector?.name ?? "the collector";
  // The housemate's own situation: they owe (their row has "I paid"), or are owed (paid back from the House Budget).
  const owes = canSend && suggestions.some((s) => s.fromMemberId === viewer.memberId);
  const isOwed = !editable && suggestions.some((s) => s.toMemberId === viewer.memberId);

  return (
    <section aria-labelledby="who-still-owes" className="rounded-xl border bg-white p-4 shadow-xs sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="who-still-owes" className="text-lg font-semibold">
          Who still owes
        </h2>
        {/* One icon that switches: lines folding together → Compact, spreading apart → Normal. */}
        {!view.issue && suggestions.length > 0 && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={isCompact ? "Normal view" : "Compact view"}
            title={isCompact ? "Normal view" : "Compact view"}
            className="text-muted-foreground sm:hidden"
            onClick={() => {
              setIsCompact(!isCompact);
              saveCompact(!isCompact);
            }}
          >
            {isCompact ? <ListChevronsUpDown /> : <ListChevronsDownUp />}
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Everyone pays into the {HOUSE_BUDGET_LABEL}, and {collectorName} pays out of it.{" "}
        {editable
          ? "Record each transfer when it happens: whoever is owed is paid first, then what's left goes to you. Housemates can send theirs with “I paid” for you to confirm."
          : owes
            ? `Sent it to the ${HOUSE_BUDGET_LABEL}? Tap “I paid” on your row and attach the screenshot of your transfer. It comes off your Final once ${collectorName} confirms it.`
            : isOwed
              ? `You paid more than your share, so ${collectorName} pays you back from the ${HOUSE_BUDGET_LABEL}. It shows here once ${collectorName} records it.`
              : `${collectorName} records each payment when money changes hands; it comes off the Final.`}
      </p>
      {!view.issue && (
        <div className="mt-3 flex justify-center">
          <p className="max-w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-center text-sm text-amber-950">
            {held >= 0 ? (
              <>
                The {HOUSE_BUDGET_LABEL} holds <span className="font-mono font-semibold tabular-nums">{formatPHP(held)}</span>
              </>
            ) : (
              <>
                The {HOUSE_BUDGET_LABEL} has paid out{" "}
                <span className="font-mono font-semibold tabular-nums">{formatPHP(-held)}</span> more than came in
              </>
            )}
          </p>
        </div>
      )}

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
            const from = partyView(s.fromMemberId, memberOf, view.houseBudgetEmoji)!;
            const to = partyView(s.toMemberId, memberOf, view.houseBudgetEmoji)!;
            // Only a housemate's payment into the House Budget can be waiting.
            const waiting =
              s.toMemberId === HOUSE_BUDGET && s.fromMemberId !== HOUSE_BUDGET ? waitingFrom(view, s.fromMemberId) : 0;
            const own = canSend && s.fromMemberId === viewer.memberId;
            return (
              // Phone: who over the amount (Compact: beside it), a small button on the right. Wider:
              // one line. Notes go underneath, so the button stays level with the amount however
              // many there are.
              <li key={`${s.fromMemberId}-${s.toMemberId}`} className="space-y-0.5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div
                    className={cn(
                      "min-w-0 flex-1",
                      isCompact
                        ? "flex flex-wrap items-center gap-x-3 gap-y-0.5 sm:flex-nowrap sm:justify-between"
                        : "space-y-0.5 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:space-y-0",
                    )}
                  >
                    <Pair from={from} to={to} compact={isCompact} />
                    <span className="block font-mono font-semibold whitespace-nowrap tabular-nums text-rose-600">
                      {formatPHP(s.amount)}
                    </span>
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
                </div>
                {s.fromMemberId === HOUSE_BUDGET && s.toMemberId === collector?.id && (
                  // Compact on a phone leaves out this explanation; the amount and the button stay.
                  <p className={cn("text-xs text-muted-foreground", isCompact && "hidden sm:block")}>
                    What&apos;s left once everyone is settled — {editable ? "yours to move to your account" : `${collectorName}'s`}
                  </p>
                )}
                {waiting > 0 && (
                  <p className="text-xs text-amber-700">
                    {formatPHP(waiting)} sent, waiting for {collector?.name}
                    {/* So PA confirms it rather than recording the same money again. */}
                    {editable && " — confirm it above instead of recording it again"}
                  </p>
                )}
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
  const from = partyView(p.fromMemberId, memberOf, view.houseBudgetEmoji);
  const to = partyView(p.toMemberId, memberOf, view.houseBudgetEmoji);
  const toName = partyName(p.toMemberId, memberOf);
  const label = `${partyName(p.fromMemberId, memberOf, "Someone")} → ${toName}`;
  // The collector checks the bank, whoever the payment went to.
  const confirmer = view.members.find((m) => m.isCollector)?.name ?? "PA";
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
            Waiting for {confirmer}
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
            description={`${formatPHP(p.amount)} to ${p.toMemberId === HOUSE_BUDGET ? `the ${toName}` : toName}, and its screenshot, are removed. Send it again with “I paid” if you need to.`}
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
          {view.houseBudget.balance !== 0 && (
            <p className="text-sm">
              The {HOUSE_BUDGET_LABEL}{" "}
              {view.houseBudget.balance > 0
                ? `still holds ${formatPHP(view.houseBudget.balance)}`
                : `has paid out ${formatPHP(-view.houseBudget.balance)} more than came in`}
              ; it carries over{next ? ` to ${next}` : ""}.
            </p>
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
