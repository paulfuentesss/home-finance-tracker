// When the month-end reminders go out, what a housemate still has to pay once their bill is
// emailed, and the housemate banner (docs/features/reminders.md). Pure — no DB — and tested in
// lib/reminders.test.ts. The daily job (lib/reminder-send.ts), the month pages and the "How it
// works" page all read these, so the days are written down once.

import { monthLabel } from "@/lib/format";
import { formatPHP, type Centavos } from "@/lib/money";

/** Days left in the month when each reminder goes out (0 = the month's last day). */
export const REMINDER_DAYS = { week: 7, three_days: 3, last_day: 0 } as const;

export type MonthEndReminder = keyof typeof REMINDER_DAYS;

/** The month's last day: (2026, 2) → 28. */
export function lastDayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** How the household says a month's last day: (2026, 10) → "the 31st", (2026, 2) → "the 28th". */
export function lastDayName(year: number, month: number): string {
  const day = lastDayOf(year, month);
  // A last day is always 28–31.
  return `the ${day}${day === 31 ? "st" : "th"}`;
}

/** Days from `today` ("YYYY-MM-DD", Manila) to the month's last day; null when today isn't in it. */
export function daysLeftIn(year: number, month: number, today: string): number | null {
  const [y, m, d] = today.split("-").map(Number);
  if (y !== year || m !== month) return null;
  return lastDayOf(year, month) - d;
}

/**
 * The reminder due today: the latest one the month has reached. A day the job didn't run (the
 * database paused, Gmail refused) is caught up the next day — the caller skips a reminder
 * already sent — and on the last day only "last day" goes out, never a late "3 days left".
 */
export function reminderDue(year: number, month: number, today: string): MonthEndReminder | null {
  const left = daysLeftIn(year, month, today);
  if (left === null || left < 0) return null;
  if (left <= REMINDER_DAYS.last_day) return "last_day";
  if (left <= REMINDER_DAYS.three_days) return "three_days";
  if (left <= REMINDER_DAYS.week) return "week";
  return null;
}

/** A housemate's payment with the House Budget, in the bill's month or a later one. */
export interface PaymentSince {
  amount: Centavos;
  status: "confirmed" | "pending" | "rejected";
  /** Made in a later month (the usual case once the next month has started). */
  later: boolean;
  /** "in" = they paid into the House Budget · "out" = the House Budget paid them back. */
  direction: "in" | "out";
}

export type Payables =
  /** Still to pay: `due` = the Final less later payments; `waiting` of it sent with "I paid". */
  | { kind: "owes"; due: Centavos; waiting: Centavos; left: Centavos }
  /** Paid more than their share: the admin pays them back from the House Budget. */
  | { kind: "owed"; amount: Centavos }
  | { kind: "settled" };

/**
 * What a housemate still has to pay (or get back) for a month whose bill went out, from that
 * month's Final. The Final counts only that month's confirmed payments, so this also takes off
 * their waiting "I paid"s and what was paid in later months — where payments go once the next
 * month has started: theirs into the House Budget, or the admin's paying them back. Rejected
 * payments never count.
 */
export function payablesOf(final: Centavos, payments: readonly PaymentSince[]): Payables {
  if (final < 0) {
    const paidBack = payments
      .filter((p) => p.direction === "out" && p.status === "confirmed" && p.later)
      .reduce((sum, p) => sum + p.amount, 0);
    const owed = -final - paidBack;
    return owed > 0 ? { kind: "owed", amount: owed } : { kind: "settled" };
  }
  let paidLater = 0;
  let waiting = 0;
  for (const p of payments) {
    if (p.direction !== "in") continue;
    if (p.status === "pending") waiting += p.amount;
    else if (p.status === "confirmed" && p.later) paidLater += p.amount;
  }
  const due = Math.max(0, final - paidLater);
  if (due === 0) return { kind: "settled" };
  const sent = Math.min(waiting, due);
  return { kind: "owes", due, waiting: sent, left: due - sent };
}

export interface AdminNudge {
  /** email_bill = every bill is in, nobody's been emailed · close = everyone has paid. */
  kind: "email_bill" | "close";
  periodId: number;
  year: number;
  month: number;
  text: string;
}

/**
 * What the admin is nudged to do next for an ended month that's still open, once every bill is
 * in (none pending, none still at ₱0, numbers that work out): close it when everyone has paid
 * and closing is allowed; otherwise, until he has, email everyone their bill. Only advice —
 * both buttons work any time. Null when there's nothing to nudge about.
 */
export function adminNudge(m: {
  periodId: number;
  year: number;
  month: number;
  status: "open" | "closed";
  ended: boolean;
  issue: string | null;
  pendingBills: readonly string[];
  /** Bill columns still at ₱0 — usually a bill that hasn't arrived. */
  emptyBills: readonly string[];
  billEmailed: boolean;
  /** closeCheck passes (earlier month closed, nothing pending or waiting). */
  canClose: boolean;
  /** Every housemate is settled for it (payablesOf → settled). */
  everyoneSettled: boolean;
}): AdminNudge | null {
  if (m.status !== "open" || !m.ended) return null;
  const name = monthLabel(m.year, m.month).split(" ")[0];
  const base = { periodId: m.periodId, year: m.year, month: m.month };
  if (m.issue || m.pendingBills.length || m.emptyBills.length) return null;
  if (m.canClose && m.everyoneSettled) {
    return { ...base, kind: "close", text: `Everyone has paid for ${name}. Ready to close it.` };
  }
  if (!m.billEmailed) {
    return { ...base, kind: "email_bill", text: `All of ${name}'s bills are in. Ready to email everyone their bill.` };
  }
  return null;
}

export type HousemateNotice =
  /** Their bill was emailed and part of it is still to pay. */
  | { kind: "bill"; text: string; href: string }
  /** All of it is sent with "I paid", waiting for the admin. */
  | { kind: "waiting"; text: string }
  /** The latest month ends within a week. */
  | { kind: "deadline"; text: string; lastDay: boolean };

/**
 * The one banner a housemate sees on the month pages, most urgent first: their emailed bill,
 * then the month-end deadline (the in-app copy of the reminder emails). Null when there's
 * nothing to do.
 */
export function housemateNotice({
  bill,
  latest,
  today,
  collectorName,
}: {
  bill: { year: number; month: number; waiting: Centavos; left: Centavos; settleHref: string } | null;
  latest: { year: number; month: number; status: "open" | "closed" } | null;
  today: string;
  collectorName: string;
}): HousemateNotice | null {
  if (bill) {
    const label = monthLabel(bill.year, bill.month);
    if (bill.left > 0) {
      const waiting = bill.waiting > 0 ? ` (${formatPHP(bill.waiting)} more is waiting for ${collectorName} to confirm)` : "";
      return {
        kind: "bill",
        text: `Your ${label} bill is ready: ${formatPHP(bill.left)} to pay${waiting}.`,
        href: bill.settleHref,
      };
    }
    if (bill.waiting > 0) {
      return { kind: "waiting", text: `Your payment for ${label} is waiting for ${collectorName} to confirm.` };
    }
  }
  if (latest?.status === "open") {
    const left = daysLeftIn(latest.year, latest.month, today);
    if (left !== null && left >= 0 && left <= REMINDER_DAYS.week) {
      const name = monthLabel(latest.year, latest.month).split(" ")[0];
      const last = lastDayName(latest.year, latest.month);
      return left === 0
        ? {
            kind: "deadline",
            text: `Today is the last day to log your ${name} expenses. From tomorrow ${name} is locked.`,
            lastDay: true,
          }
        : {
            kind: "deadline",
            text: `${left} day${left === 1 ? "" : "s"} left to log your ${name} expenses. It locks after ${last}.`,
            lastDay: false,
          };
    }
  }
  return null;
}
