"use client";

import { ArrowRight, Lock, LockOpen, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { closeMonth, deletePayment, reopenMonth, type ActionState } from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { EditPaymentDialog, RecordPaymentDialog } from "@/components/entry-dialogs";
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
import { useCanEdit, useViewer } from "@/components/viewer-context";
import { dateLabel, monthLabel } from "@/lib/format";
import { formatPHP } from "@/lib/money";
import { isAdmin } from "@/lib/permissions";
import type { PeriodView, ViewMember, ViewPayment } from "@/lib/periods";
import { suggestedPayments } from "@/lib/settlement";
import { cn } from "@/lib/utils";

// Tab: Settle Up. Who still owes whom (one tap records the payment), the payments recorded
// this month, and closing / reopening the month (docs/settlement-rules.md).
export function SettleUp({ view }: { view: PeriodView }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <WhoStillOwes view={view} />
        <PaymentsList view={view} />
      </div>
      <MonthLock view={view} />
    </div>
  );
}

function WhoStillOwes({ view }: { view: PeriodView }) {
  // Only PA records payments (in an open month).
  const editable = useCanEdit(view.period.status);
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
          ? "Record a payment when money changes hands; it comes off both people's Final."
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
            return (
              <li
                key={`${s.fromMemberId}-${s.toMemberId}`}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center justify-between gap-3 sm:justify-start">
                  <Pair from={from} to={to} />
                  <span className="font-mono font-semibold tabular-nums text-rose-600 sm:hidden">
                    {formatPHP(s.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden font-mono font-semibold tabular-nums text-rose-600 sm:inline">
                    {formatPHP(s.amount)}
                  </span>
                  {editable && (
                    <RecordPaymentDialog
                      view={view}
                      prefill={s}
                      label="Record payment"
                      className="w-full sm:w-auto"
                    />
                  )}
                </div>
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
    </section>
  );
}

function PaymentsList({ view }: { view: PeriodView }) {
  // Only PA records payments (in an open month).
  const editable = useCanEdit(view.period.status);
  const [editing, setEditing] = useState<ViewPayment | null>(null);
  const memberOf = new Map(view.members.map((m) => [m.id, m]));

  return (
    <section aria-labelledby="payments-this-month" className="rounded-xl border bg-white p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="payments-this-month" className="text-lg font-semibold">
          Payments this month
        </h2>
        {editable && <RecordPaymentDialog view={view} label="Record other payment" variant="outline" />}
      </div>

      {view.payments.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No payments recorded yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y">
          {view.payments.map((p) => {
            const from = memberOf.get(p.fromMemberId);
            const to = memberOf.get(p.toMemberId);
            return (
              <li key={p.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 space-y-0.5">
                  {from && to && <Pair from={from} to={to} />}
                  <p className="text-xs text-muted-foreground">
                    {dateLabel(p.paidOn)}
                    {p.note && <> · {p.note}</>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="mr-1 font-mono text-sm font-semibold tabular-nums">{formatPHP(p.amount)}</span>
                  {editable && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit payment"
                        className="text-muted-foreground"
                        onClick={() => setEditing(p)}
                      >
                        <Pencil />
                      </Button>
                      <ConfirmDeleteButton
                        label="Delete payment"
                        title="Delete this payment?"
                        description={`${from?.name} → ${to?.name}, ${formatPHP(p.amount)}. Both Finals go back to what they were before it, and any proof attached to it is deleted.`}
                        onConfirm={() => deletePayment(p.id)}
                      />
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <EditPaymentDialog view={view} payment={editing} onClose={() => setEditing(null)} />
    </section>
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

function Pair({ from, to }: { from: ViewMember; to: ViewMember }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium">
      <Dot member={from} />
      {from.name}
      <ArrowRight className="size-3.5 text-muted-foreground" aria-label="pays" />
      <Dot member={to} />
      {to.name}
    </span>
  );
}

function Dot({ member }: { member: ViewMember }) {
  return <span className={cn("size-2 rounded-full", member.dotClass)} aria-hidden />;
}
