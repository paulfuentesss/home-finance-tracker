// Rules for closing and reopening months (docs/settlement-rules.md → "Closing and reopening").
// Pure functions so they're easy to test; the Server Actions and the UI both use them.

import { monthLabel } from "@/lib/format";
import type { Centavos } from "@/lib/money";
import type { MemberId } from "@/lib/settlement";

export interface LockCheck {
  ok: boolean;
  /** Why it can't be done, in words for the household. */
  reason?: string;
}

interface MonthRef {
  year: number;
  month: number;
  status: "open" | "closed";
}

/**
 * Months close oldest-first: a closed month's opening balance must itself be locked, or
 * editing an earlier month could still change it. Pending (emailed) bills must be confirmed
 * or discarded first, and housemates' waiting payments confirmed or rejected: in a closed
 * month they could never be.
 */
export function closeCheck(
  current: MonthRef,
  prev: MonthRef | null,
  issue: string | null,
  pendingBills: readonly string[] = [],
  waitingPayments: readonly string[] = [],
): LockCheck {
  if (current.status === "closed") return { ok: false, reason: "This month is already closed." };
  if (prev && prev.status !== "closed") {
    return { ok: false, reason: `Close ${monthLabel(prev.year, prev.month)} first.` };
  }
  const numbers = payablesCheck(issue, pendingBills);
  if (!numbers.ok) return numbers;
  if (waitingPayments.length) return { ok: false, reason: waitingReason(waitingPayments) };
  return { ok: true };
}

/**
 * The next month can't start while a housemate's payment waits in this one: the next month's
 * carry-over counts only confirmed payments, so it would show them owing it all again, away
 * from the note saying it's waiting — and they might pay twice.
 */
export function startCheck(waitingPayments: readonly string[]): LockCheck {
  return waitingPayments.length ? { ok: false, reason: waitingReason(waitingPayments) } : { ok: true };
}

/** `waitingPayments` are labels like "Ben ₱1,000.00". */
function waitingReason(waitingPayments: readonly string[]): string {
  const which = waitingPayments.length === 1 ? "the waiting payment" : "the waiting payments";
  return `Confirm or reject ${which} first (Settle Up): ${waitingPayments.join(", ")}.`;
}

/**
 * Whether each housemate's bill can be emailed (Settle Up, docs/features/reminders.md): only once
 * the numbers can be worked out and no emailed bill is still pending — otherwise the amounts
 * would change after they're sent. A waiting "I paid" doesn't stop it (the email mentions it).
 */
export function payablesCheck(issue: string | null, pendingBills: readonly string[] = []): LockCheck {
  if (issue) return { ok: false, reason: "Fix the problem above first; the numbers can't be calculated yet." };
  if (pendingBills.length) {
    const bills = `${pendingBills.join(", ")} bill${pendingBills.length > 1 ? "s" : ""}`;
    return { ok: false, reason: `Confirm or discard the pending ${bills} first (Split Table).` };
  }
  return { ok: true };
}

/**
 * Whether the month's last day has passed (`today` is "YYYY-MM-DD" in Manila, from
 * todayInManila — never the server's UTC date). An ended month is locked for housemates: only
 * the admin can still add or change things until it's closed (docs/settlement-rules.md →
 * "Closing and reopening"). Payments ("I paid") aren't affected.
 */
export function monthHasEnded(year: number, month: number, today: string): boolean {
  return today.slice(0, 7) > `${year}-${String(month).padStart(2, "0")}`;
}

/** The month after: (2026, 12) → { year: 2027, month: 1 }. */
export function monthAfter(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** Months reopen newest-first, so a closed month never follows an open one. */
export function reopenCheck(current: MonthRef, next: MonthRef | null): LockCheck {
  if (current.status === "open") return { ok: false, reason: "This month is already open." };
  if (next && next.status !== "open") {
    return { ok: false, reason: `Reopen ${monthLabel(next.year, next.month)} first.` };
  }
  return { ok: true };
}

/**
 * Members whose unsettled Final would be lost because they aren't in the next month (e.g.
 * they moved out). Empty when there's no next month yet.
 */
export function vanishingBalances(
  finals: ReadonlyMap<MemberId, Centavos>,
  nextMemberIds: ReadonlySet<MemberId> | null,
): MemberId[] {
  if (!nextMemberIds) return [];
  return [...finals].filter(([id, balance]) => balance !== 0 && !nextMemberIds.has(id)).map(([id]) => id);
}
