// What the month pages show about My House's emails (docs/features/reminders.md): a housemate's
// "your bill is ready" banner, and the admin's "Email everyone their bill" box on Settle Up
// (with the view-only logins' "the bills are in" note).
// Nothing here goes to the browser except names, amounts and dates — never an email address.

import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { billEmails, billingPeriods, billItems, db, members, reminderSends } from "@/db";
import { emailIsLive } from "@/lib/email";
import { dateInManila, dayLabel, momentLabel, todayInManila } from "@/lib/format";
import { BILL_EMAIL_COLUMNS } from "@/lib/household-config";
import { sharesCosts } from "@/lib/members";
import { toCentavos, type Centavos } from "@/lib/money";
import { closeCheck, monthHasEnded, payablesCheck, type LockCheck } from "@/lib/month-lock";
import { isAdmin, type Viewer } from "@/lib/permissions";
import { computeForPayables, loadPeriods, payablesIn, pendingBillNames, waitingPaymentLabels } from "@/lib/periods";
import {
  adminNudge,
  billsComingUp,
  billsDue,
  REMINDER_DAYS,
  seenAfter,
  type AdminNudge,
  type BillDue,
  type MonthEndReminder,
  type Payables,
} from "@/lib/reminders";

export interface BillNotice {
  year: number;
  month: number;
  due: Centavos;
  waiting: Centavos;
  left: Centavos;
  /** The latest month's Settle Up, where "I paid" goes. */
  settleHref: string;
}

export interface BillSend {
  memberId: number;
  periodId: number;
  year: number;
  month: number;
  sentAt: Date;
}

/**
 * Each member's latest bill email: the latest month whose bill went to them, and when (a resend
 * moves the time). Only `memberId`'s when given. The banner (getBillNotice) and the daily job's
 * unpaid follow-ups both start from this, so they always talk about the same month.
 */
export async function latestBillSends(memberId?: number): Promise<BillSend[]> {
  const rows = await db
    .select({
      memberId: reminderSends.memberId,
      periodId: reminderSends.periodId,
      year: billingPeriods.year,
      month: billingPeriods.month,
      sentAt: reminderSends.sentAt,
    })
    .from(reminderSends)
    .innerJoin(billingPeriods, eq(billingPeriods.id, reminderSends.periodId))
    .where(
      and(eq(reminderSends.kind, "payables"), memberId === undefined ? undefined : eq(reminderSends.memberId, memberId)),
    )
    .orderBy(desc(billingPeriods.year), desc(billingPeriods.month));
  const latest = new Map<number, BillSend>();
  for (const row of rows) if (!latest.has(row.memberId)) latest.set(row.memberId, row);
  return [...latest.values()];
}

/**
 * The bill the viewer still has to pay, from the latest month whose bill was emailed to them —
 * null once it's paid (or for the admin and view-only logins). Pass whoever the page is drawn
 * for, so a preview shows that housemate's.
 */
export async function getBillNotice(viewer: Viewer): Promise<BillNotice | null> {
  if (isAdmin(viewer) || !sharesCosts(viewer)) return null;
  const [last] = await latestBillSends(viewer.memberId);
  if (!last) return null;
  const computed = await computeForPayables(db, last.year, last.month);
  const owed = computed && payablesIn(computed, viewer.memberId);
  if (!computed || owed?.payables.kind !== "owes") return null;
  const latest = computed.all.at(-1)!;
  const { due, waiting, left } = owed.payables;
  return { year: last.year, month: last.month, due, waiting, left, settleHref: `/periods/${latest.year}/${latest.month}/settle` };
}

/**
 * The admin's nudge (lib/reminders.ts → adminNudge) for the oldest ended month that's still
 * open — the next one to email and close. Null when there's none. Used by the month pages and
 * the daily job (which emails it once).
 */
export async function findAdminNudge(today: string): Promise<AdminNudge | null> {
  // The page's shared load of the whole history, which computeForPayables reads next anyway.
  const months = await loadPeriods();
  const target = months.find((m) => m.status === "open" && monthHasEnded(m.year, m.month, today));
  if (!target) return null;
  const computed = await computeForPayables(db, target.year, target.month);
  if (!computed) return null;
  const { all, index, period, issue } = computed;
  const [emailed] = await db
    .select({ id: reminderSends.id })
    .from(reminderSends)
    .where(and(eq(reminderSends.periodId, period.id), eq(reminderSends.kind, "payables")))
    .limit(1);
  const pending = pendingBillNames(period);
  const housemates = period.balances.map((b) => b.member).filter((m) => !m.isCollector && sharesCosts(m));
  return adminNudge({
    periodId: period.id,
    year: period.year,
    month: period.month,
    status: period.status,
    ended: true,
    issue,
    pendingBills: pending,
    emptyBills: period.billItems
      .filter((b) => b.status === "confirmed" && toCentavos(b.totalAmount) === 0)
      .map((b) => b.name),
    billEmailed: Boolean(emailed),
    canClose: closeCheck(period, all[index - 1] ?? null, issue, pending, waitingPaymentLabels(period)).ok,
    everyoneSettled: housemates.every((m) => payablesIn(computed, m.id)?.payables.kind === "settled"),
  });
}

/** The nudge for the admin's month pages (null for anyone else, or while previewing as a housemate). */
export async function getAdminNudge(viewer: Viewer): Promise<AdminNudge | null> {
  return isAdmin(viewer) ? findAdminNudge(todayInManila()) : null;
}

/**
 * The bills still to pay the billers (lib/reminders.ts → billsDue): every month's bill columns
 * with a Due date and no Date paid, and the Bill inbox's unmatched emails with a due date. Used
 * by the admin's banner and the daily job's "bills to pay" email.
 */
export async function loadBillsDue(today: string): Promise<BillDue[]> {
  const inMonth = eq(billingPeriods.id, billItems.periodId);
  const [bills, emails] = await Promise.all([
    db
      .select({
        id: billItems.id,
        name: billItems.name,
        periodId: billItems.periodId,
        year: billingPeriods.year,
        month: billingPeriods.month,
        kind: billItems.kind,
        dueDate: billItems.dueDate,
        paidOn: billItems.paidOn,
        totalAmount: billItems.totalAmount,
        status: billItems.status,
      })
      .from(billItems)
      .innerJoin(billingPeriods, inMonth)
      .where(and(isNotNull(billItems.dueDate), isNull(billItems.paidOn))),
    db
      .select({
        id: billEmails.id,
        provider: billEmails.provider,
        year: billEmails.billYear,
        month: billEmails.billMonth,
        dueDate: billEmails.dueDate,
      })
      .from(billEmails)
      .where(and(eq(billEmails.status, "unmatched"), isNotNull(billEmails.dueDate), isNotNull(billEmails.provider))),
  ]);
  // The emails' own columns, to see whether they already have a Due date or a Date paid.
  const columns =
    emails.length === 0
      ? []
      : await db
          .select({
            name: billItems.name,
            year: billingPeriods.year,
            month: billingPeriods.month,
            dueDate: billItems.dueDate,
            paidOn: billItems.paidOn,
          })
          .from(billItems)
          .innerJoin(billingPeriods, inMonth)
          .where(inArray(billItems.name, Object.values(BILL_EMAIL_COLUMNS)));
  return billsDue(
    bills.map(({ totalAmount, status, ...b }) => ({ ...b, total: toCentavos(totalAmount), pending: status === "pending" })),
    emails.map((e) => {
      const name = BILL_EMAIL_COLUMNS[e.provider!];
      const column = columns.find((c) => c.name === name && c.year === e.year && c.month === e.month);
      return {
        emailId: e.id,
        name,
        year: e.year,
        month: e.month,
        dueDate: e.dueDate,
        column: column ? { dueDate: column.dueDate, paidOn: column.paidOn } : null,
      };
    }),
    today,
  );
}

/**
 * The bills banner, for whoever the page is drawn for: the admin's whole list, or the "coming
 * up" note housemates and view-only logins see (billsComingUp), so a preview shows theirs.
 */
export async function getBillsDue(viewer: Viewer): Promise<BillDue[]> {
  const due = await loadBillsDue(todayInManila());
  return isAdmin(viewer) ? due : billsComingUp(due);
}

export interface EmailStatus {
  /** False on localhost: emails go to EMAIL_TEST_TO and nothing is recorded. */
  live: boolean;
  canSend: LockCheck;
  /** Everyone the bill email is for (not the collector), in the month's order. */
  recipients: {
    memberId: number;
    name: string;
    hasEmail: boolean;
    payables: Payables | null;
    /** When they were last sent this month's bill ("Oct. 31"), or null if never. */
    sentOn: string | null;
    /** When they last got the "still unpaid" follow-up since that bill email ("Nov. 3"), or null. */
    remindedOn: string | null;
    /** When they first opened a month page after that bill email ("Nov. 1"), or null. */
    seenOn: string | null;
  }[];
  /** View-only logins, who get a "the bills are in" note with the first bill email. */
  viewOnly: {
    memberId: number;
    name: string;
    hasEmail: boolean;
    /** When they were sent this month's note ("Oct. 31"), or null if never. */
    sentOn: string | null;
    /** When they first opened a month page after that note ("Nov. 1"), or null. */
    seenOn: string | null;
  }[];
  /** When the bill was last emailed for this month ("Oct. 31, 2026, 9:14 AM"). */
  payablesSentAt: string | null;
  /** The latest month-end reminder sent for this month. */
  lastReminder: { kind: MonthEndReminder; sentAt: string } | null;
}

/** "Oct. 31", the Manila date a bill email went out (null when it hasn't). */
function billSentOn(sentAt: Date | undefined): string | null {
  return sentAt ? dayLabel(dateInManila(sentAt)) : null;
}

/** The admin's view of a month's emails, for Settle Up. Null for anyone else (pass the real viewer). */
export async function getEmailStatus(viewer: Viewer, year: number, month: number): Promise<EmailStatus | null> {
  if (!isAdmin(viewer)) return null;
  const computed = await computeForPayables(db, year, month);
  if (!computed) return null;
  const sends = await db
    .select({
      kind: reminderSends.kind,
      memberId: reminderSends.memberId,
      sentAt: reminderSends.sentAt,
      seenAt: reminderSends.seenAt,
    })
    .from(reminderSends)
    .where(
      and(
        eq(reminderSends.periodId, computed.period.id),
        inArray(reminderSends.kind, ["week", "three_days", "last_day", "payables", "bills_in", "unpaid"]),
      ),
    )
    .orderBy(desc(reminderSends.sentAt));
  const payables = sends.find((s) => s.kind === "payables");
  const reminder = sends.find((s) => s.kind in REMINDER_DAYS);
  const sendOf = (kind: "payables" | "unpaid" | "bills_in", memberId: number) =>
    sends.find((s) => s.kind === kind && s.memberId === memberId);
  // A follow-up from before the bill was sent again belongs to the old send: not shown.
  const remindedOn = (memberId: number) => {
    const bill = sendOf("payables", memberId)?.sentAt;
    const reminded = sendOf("unpaid", memberId)?.sentAt;
    return bill && reminded && reminded > bill ? billSentOn(reminded) : null;
  };
  // Likewise, a "seen" from before a resend.
  const seenOn = (send: (typeof sends)[number] | undefined) =>
    send ? billSentOn(seenAfter(send.sentAt, send.seenAt) ?? undefined) : null;
  const housemates = computed.period.balances
    .map((b) => b.member)
    .filter((m) => !m.isCollector && sharesCosts(m))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const viewOnly = await db.query.members.findMany({
    where: and(eq(members.role, "view_only"), eq(members.active, true)),
    orderBy: [asc(members.sortOrder), asc(members.id)],
  });
  return {
    live: emailIsLive(),
    canSend: payablesCheck(computed.issue, pendingBillNames(computed.period)),
    recipients: housemates.map((m) => ({
      memberId: m.id,
      name: m.name,
      hasEmail: Boolean(m.email),
      payables: payablesIn(computed, m.id)?.payables ?? null,
      sentOn: billSentOn(sendOf("payables", m.id)?.sentAt),
      remindedOn: remindedOn(m.id),
      seenOn: seenOn(sendOf("payables", m.id)),
    })),
    viewOnly: viewOnly.map((m) => ({
      memberId: m.id,
      name: m.name,
      hasEmail: Boolean(m.email),
      sentOn: billSentOn(sendOf("bills_in", m.id)?.sentAt),
      seenOn: seenOn(sendOf("bills_in", m.id)),
    })),
    payablesSentAt: payables ? momentLabel(payables.sentAt) : null,
    lastReminder: reminder ? { kind: reminder.kind as MonthEndReminder, sentAt: momentLabel(reminder.sentAt) } : null,
  };
}
