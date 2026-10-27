// When the month-end reminders go out, what a housemate still has to pay once their bill is
// emailed, and the housemate banner (docs/features/reminders.md). Pure — no DB — and tested in
// lib/reminders.test.ts. The daily job (lib/reminder-send.ts), the month pages and the "How it
// works" page all read these, so the days are written down once.

import { addDays, dateInManila, dayLabel, daysBetween, monthLabel } from "@/lib/format";
import { formatPHP, type Centavos } from "@/lib/money";

/** Days left in the month when each reminder goes out (0 = the month's last day). */
export const REMINDER_DAYS = { week: 7, three_days: 3, last_day: 0 } as const;

/** A bill still unpaid: the first follow-up this many days after the bill email, then every `then` days. */
export const UNPAID_REMINDER_DAYS = { first: 3, then: 4 } as const;

/**
 * A biller's due date (the admin's): the banner shows a bill from `banner` days before it's due;
 * the morning email and push go out `soon` days before, on the day, and the day after.
 */
export const BILL_DUE_DAYS = { banner: 7, soon: 3 } as const;

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

/**
 * Whether a housemate who still owes part of an emailed bill is due a follow-up today: the first
 * one `UNPAID_REMINDER_DAYS.first` days after their latest bill email, then one every `then` days.
 * A follow-up from before that bill email (it was sent again) doesn't count, so a resend starts
 * the count again. Counted in Manila days, and "at least", so a day the job missed is caught up.
 * The caller checks they still owe (payablesOf → owes, with something left to pay).
 */
export function unpaidReminderDue({
  billSentAt,
  lastReminderAt,
  today,
}: {
  billSentAt: Date;
  lastReminderAt: Date | null;
  /** Manila's date, "YYYY-MM-DD". */
  today: string;
}): boolean {
  if (lastReminderAt && lastReminderAt > billSentAt) {
    return daysBetween(dateInManila(lastReminderAt), today) >= UNPAID_REMINDER_DAYS.then;
  }
  return daysBetween(dateInManila(billSentAt), today) >= UNPAID_REMINDER_DAYS.first;
}

/**
 * When a housemate (or view-only login) saw the email sent at `sentAt` — opened a month page
 * after it — or null if they haven't yet. A "seen" from before a resend belongs to the old send,
 * so it stops counting without being cleared.
 */
export function seenAfter(sentAt: Date, seenAt: Date | null): Date | null {
  return seenAt && seenAt >= sentAt ? seenAt : null;
}

/** A bill column, as the biller due-date reminder reads it. */
export interface DueBillRow {
  id: number;
  name: string;
  periodId: number;
  year: number;
  month: number;
  kind: "standard" | "helper";
  dueDate: string | null;
  paidOn: string | null;
  total: Centavos;
  /** Filled in from a bill email and not confirmed yet. */
  pending: boolean;
}

/** A Bill inbox email (unmatched) with a due date. */
export interface DueInboxRow {
  emailId: number;
  /** The bill column it's for ("Meralco"). */
  name: string;
  year: number | null;
  month: number | null;
  dueDate: string | null;
  /** That month's column of the same name, if there is one. */
  column: { dueDate: string | null; paidOn: string | null } | null;
}

export type BillDue = { dueDate: string; daysLeft: number; name: string } & (
  | { source: "bill"; id: number; periodId: number; year: number; month: number; total: Centavos; pending: boolean }
  | { source: "inbox"; emailId: number; year: number | null; month: number | null }
);

/**
 * The bills the admin still has to pay the biller for (docs/features/reminders.md → Biller due
 * dates): a Due date, no Date paid, an amount, due within `BILL_DUE_DAYS.banner` days or
 * overdue, in any month (a month's bills fall due after it ends, often after it's closed). Not
 * the Helper, who has no biller. Pending bills count: they still need paying. A Bill inbox email
 * counts too, so a bill that couldn't fill its column isn't missed — unless its column has its
 * own Due date (it shows from there) or a Date paid. Soonest first.
 */
export function billsDue(bills: readonly DueBillRow[], inbox: readonly DueInboxRow[], today: string): BillDue[] {
  const near = (dueDate: string) => daysBetween(today, dueDate) <= BILL_DUE_DAYS.banner;
  const due: BillDue[] = [];
  for (const b of bills) {
    if (b.kind === "helper" || !b.dueDate || b.paidOn || b.total <= 0 || !near(b.dueDate)) continue;
    const { id, name, periodId, year, month, total, pending, dueDate } = b;
    due.push({ source: "bill", id, name, periodId, year, month, total, pending, dueDate, daysLeft: daysBetween(today, dueDate) });
  }
  for (const e of inbox) {
    if (!e.dueDate || !near(e.dueDate) || e.column?.dueDate || e.column?.paidOn) continue;
    const { emailId, name, year, month, dueDate } = e;
    due.push({ source: "inbox", emailId, name, year, month, dueDate, daysLeft: daysBetween(today, dueDate) });
  }
  return due.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
}

/**
 * What housemates and view-only logins see of it: a calm "coming up" note, no email or push.
 * Bill columns due today or later only: an overdue one stays on the admin's banner (a late
 * "Paid today" shouldn't worry anyone), and the Bill inbox is the admin's chore.
 */
export function billsComingUp(due: readonly BillDue[]): Extract<BillDue, { source: "bill" }>[] {
  return due.filter((b): b is Extract<BillDue, { source: "bill" }> => b.source === "bill" && b.daysLeft >= 0);
}

/** The housemates' note: "Coming up: Water today · PLDT Wifi Oct. 30. PA pays these billers, nothing for you to do." */
export function comingUpText(bills: readonly { name: string; dueDate: string; daysLeft: number }[], collectorName: string): string {
  const when = (b: { dueDate: string; daysLeft: number }) =>
    b.daysLeft === 0 ? "today" : b.daysLeft === 1 ? "tomorrow" : dayLabel(b.dueDate);
  const list = bills.map((b) => `${b.name} ${when(b)}`).join(" · ");
  return `Coming up: ${list}. ${collectorName} pays ${bills.length === 1 ? "this biller" : "these billers"}, nothing for you to do.`;
}

/**
 * Whether the admin gets a month's "bills to pay" email and push this morning: some unpaid bill
 * reached a step — `BILL_DUE_DAYS.soon` days before it's due, the due day, or the day after —
 * since the last one (`lastSentOn`, Manila's date). A day the job missed is caught up, each step
 * is told once, and a step more than `BILL_DUE_DAYS.banner` days ago is never dug up.
 */
export function billDueReminderDue({
  dueDates,
  lastSentOn,
  today,
}: {
  /** The month's bills still to pay (billsDue → source "bill"). */
  dueDates: readonly string[];
  lastSentOn: string | null;
  /** Manila's date, "YYYY-MM-DD". */
  today: string;
}): boolean {
  return dueDates.some((due) =>
    [addDays(due, -BILL_DUE_DAYS.soon), due, addDays(due, 1)].some(
      (step) =>
        step <= today &&
        daysBetween(step, today) <= BILL_DUE_DAYS.banner &&
        (lastSentOn === null || step > lastSentOn),
    ),
  );
}

/** The banner's short pill: "in 3 days", "tomorrow", "today", "2 days overdue". */
export function dueIn(daysLeft: number): string {
  if (daysLeft > 1) return `in ${daysLeft} days`;
  if (daysLeft === 1) return "tomorrow";
  if (daysLeft === 0) return "today";
  return `${-daysLeft} day${daysLeft === -1 ? "" : "s"} overdue`;
}

/** "due in 3 days (Nov. 14)", "due tomorrow (Nov. 12)", "due today", "2 days overdue (due Nov. 2)". */
export function dueWhen({ daysLeft, dueDate }: { daysLeft: number; dueDate: string }): string {
  const day = dayLabel(dueDate);
  if (daysLeft > 1) return `due in ${daysLeft} days (${day})`;
  if (daysLeft === 1) return `due tomorrow (${day})`;
  if (daysLeft === 0) return "due today";
  return `${-daysLeft} day${daysLeft === -1 ? "" : "s"} overdue (due ${day})`;
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
 * payments never count. `latestFinal` (their Final in the latest month) caps it: never more
 * than they owe, or are owed, overall now (docs/settlement-rules.md).
 */
export function payablesOf(final: Centavos, payments: readonly PaymentSince[], latestFinal?: Centavos): Payables {
  // Never more than they owe (or are owed) overall now: a later month's own numbers — say,
  // advances they paid — can settle an earlier bill without any payment.
  const cap = (amount: Centavos, overall: Centavos) => (latestFinal === undefined ? amount : Math.min(amount, Math.max(0, overall)));
  if (final < 0) {
    const paidBack = payments
      .filter((p) => p.direction === "out" && p.status === "confirmed" && p.later)
      .reduce((sum, p) => sum + p.amount, 0);
    const owed = cap(-final - paidBack, -(latestFinal ?? 0));
    return owed > 0 ? { kind: "owed", amount: owed } : { kind: "settled" };
  }
  let paidLater = 0;
  let waiting = 0;
  for (const p of payments) {
    if (p.direction !== "in") continue;
    if (p.status === "pending") waiting += p.amount;
    else if (p.status === "confirmed" && p.later) paidLater += p.amount;
  }
  const due = Math.max(0, cap(final - paidLater, latestFinal ?? 0));
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
