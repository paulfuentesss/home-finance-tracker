// Sends My House's emails and records them (docs/features/reminders.md): the daily month-end
// reminders and "still unpaid" follow-ups (app/api/reminders/route.ts, run by Vercel's cron) and
// Settle Up's "Email everyone their bill" (the emailPayables action). The rules and words are pure: lib/reminders.ts,
// lib/reminder-emails.ts.

import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { billingPeriods, db, members, reminderSends, type Member } from "@/db";
import { appLink, EmailNotSetUpError, emailIsLive, sendEmail } from "@/lib/email";
import { ActionError } from "@/lib/errors";
import { monthLabel } from "@/lib/format";
import { sharesCosts } from "@/lib/members";
import { monthHasEnded, payablesCheck } from "@/lib/month-lock";
import { startNextMonthIn } from "@/lib/month-start";
import { computeForPayables, payablesIn, pendingBillNames } from "@/lib/periods";
import { sendPush } from "@/lib/push";
import { billReadyPush, monthEndPush, PUSHES, readyPush, startBlockedPush, unpaidPush, type Push } from "@/lib/push-messages";
import {
  billsInEmail,
  monthEndEmail,
  payablesEmail,
  readyEmail,
  startBlockedEmail,
  unpaidEmail,
  type Email,
} from "@/lib/reminder-emails";
import { findAdminNudge, latestBillSends } from "@/lib/reminder-status";
import { daysLeftIn, reminderDue, unpaidReminderDue } from "@/lib/reminders";

type ReminderKind = (typeof reminderSends.$inferInsert)["kind"];
type Recipient = Pick<Member, "id" | "name"> & { email: string };

export interface ReminderOutcome {
  today: string;
  live: boolean;
  /** What happened to the next month, if the latest one has ended. */
  month?: string;
  sent: string[];
  failed: string[];
}

/** Who gets a month's emails: everyone in it who shares the costs and has an email, but the collector. */
function recipientsOf(inMonth: readonly Member[]): Recipient[] {
  return inMonth
    .filter((m) => !m.isCollector && sharesCosts(m) && m.email)
    .map((m) => ({ id: m.id, name: m.name, email: m.email! }));
}

/**
 * The daily job. `today` is Manila's date. Sends the month-end reminder due today to each
 * housemate (lib/reminders.ts → reminderDue); starts the next month once the latest has ended
 * (telling the admin when it can't); follows up on emailed bills still unpaid; and emails the
 * admin's "ready to email the bill" / "ready to close" nudge. Each email is sent at most once
 * (the unpaid follow-up at most once each time it's due).
 */
export async function runDailyReminders(today: string): Promise<ReminderOutcome> {
  const outcome: ReminderOutcome = { today, live: emailIsLive(), sent: [], failed: [] };
  const [year, month] = today.split("-").map(Number);
  const periods = await db.query.billingPeriods.findMany({
    orderBy: [asc(billingPeriods.year), asc(billingPeriods.month)],
    with: { balances: { with: { member: true } }, payments: true },
  });

  // Housemates: the reminder due today, in this calendar month (if it's started and open).
  const current = periods.find((p) => p.year === year && p.month === month);
  const due = current?.status === "open" ? reminderDue(year, month, today) : null;
  if (current && due) {
    const daysLeft = daysLeftIn(year, month, today)!;
    const link = appLink(`/periods/${year}/${month}/advances`);
    for (const member of recipientsOf(current.balances.map((b) => b.member))) {
      const email = monthEndEmail(due, { name: member.name, year, month, daysLeft, link });
      await sendOnce(current.id, due, member, email, outcome, monthEndPush(due, { year, month, daysLeft }));
    }
  }

  const latest = periods.at(-1);
  const collector = latest?.balances.map((b) => b.member).find((m) => m.isCollector);
  const admin = collector?.email ? { id: collector.id, name: collector.name, email: collector.email } : null;

  // The next month starts by itself once the latest has ended, so housemates can keep logging.
  // Off the live site it's only checked: localhost shares the database. When it can't (a
  // waiting payment, say), the admin hears why once, and it's tried again every morning.
  if (latest && monthHasEnded(latest.year, latest.month, today)) {
    try {
      const next = await db.transaction((tx) => startNextMonthIn(tx, { dryRun: !outcome.live }));
      outcome.month = `${outcome.live ? "started" : "would start"} ${monthLabel(next.year, next.month)}`;
    } catch (error) {
      if (!(error instanceof ActionError)) throw error;
      outcome.month = `couldn't start: ${error.message}`;
      if (admin) {
        const email = startBlockedEmail({
          name: admin.name,
          year: latest.year,
          month: latest.month,
          reason: error.message,
          link: appLink(`/periods/${latest.year}/${latest.month}/settle`),
        });
        const push = startBlockedPush({ year: latest.year, month: latest.month });
        await sendOnce(latest.id, "start_next", admin, email, outcome, push);
      }
    }
  }

  // Housemates whose emailed bill is still unpaid: a follow-up a few days on, then every few days. After
  // the next month has started, so the link goes where "I paid" now goes.
  await sendUnpaidReminders(today, outcome);

  // The admin's nudge — ready to email the bill, or to close — once each per month.
  const nudge = await findAdminNudge(today);
  if (nudge && admin) {
    const email = readyEmail({
      name: admin.name,
      kind: nudge.kind,
      year: nudge.year,
      month: nudge.month,
      link: appLink(`/periods/${nudge.year}/${nudge.month}/settle`),
    });
    const push = readyPush({ kind: nudge.kind, year: nudge.year, month: nudge.month });
    await sendOnce(nudge.periodId, nudge.kind === "email_bill" ? "ready_bill" : "ready_close", admin, email, outcome, push);
  }
  return outcome;
}

/**
 * Claims the reminder, then sends it. Only the run that wins the claim sends (Vercel can call a
 * cron twice), and a failed send gives the claim back so the next day's run retries just that
 * person. Off the live site nothing is claimed (lib/email.ts → safety switch). Returns the error
 * when the send failed (it's also in `outcome.failed`). `push` goes out only once the email has
 * (and only for the kinds in PUSHES), so a retried email never pushes twice; it never throws.
 */
async function sendOnce(
  periodId: number,
  kind: ReminderKind,
  to: Recipient,
  email: Email,
  outcome: Pick<ReminderOutcome, "sent" | "failed">,
  push?: Push | null,
): Promise<unknown> {
  const live = emailIsLive();
  if (live) {
    const claimed = await db
      .insert(reminderSends)
      .values({ periodId, kind, memberId: to.id })
      .onConflictDoNothing()
      .returning({ id: reminderSends.id });
    if (claimed.length === 0) return undefined;
  }
  try {
    await sendEmail(to.email, to.name, email);
    outcome.sent.push(`${kind} → ${to.name}`);
  } catch (error) {
    console.error(`Couldn't send the ${kind} email to ${to.name}`, error);
    outcome.failed.push(`${kind} → ${to.name}`);
    if (live) {
      await db
        .delete(reminderSends)
        .where(
          and(eq(reminderSends.periodId, periodId), eq(reminderSends.kind, kind), eq(reminderSends.memberId, to.id)),
        );
    }
    return error;
  }
  if (push && PUSHES[kind]) await sendPush([to], push);
  return undefined;
}

/**
 * The "still unpaid" follow-ups (lib/reminders.ts → unpaidReminderDue). Each housemate's is about
 * the latest month whose bill went to them — the month their banner shows (latestBillSends) —
 * whether or not it's closed since: closing doesn't settle anyone, and the next bill email moves
 * it on to that month, which carries the rest over. Only while part of it is left to pay, and
 * not while that month's numbers are being changed (what blocks the bill email blocks this too).
 */
async function sendUnpaidReminders(today: string, outcome: ReminderOutcome) {
  const bills = await latestBillSends();
  if (bills.length === 0) return;
  const reminders = await db.select().from(reminderSends).where(eq(reminderSends.kind, "unpaid"));
  const months = new Map<number, Awaited<ReturnType<typeof computeForPayables>>>();
  for (const bill of bills) {
    if (!months.has(bill.periodId)) months.set(bill.periodId, await computeForPayables(db, bill.year, bill.month));
    const computed = months.get(bill.periodId);
    if (!computed || !payablesCheck(computed.issue, pendingBillNames(computed.period)).ok) continue;
    const member = recipientsOf(computed.period.balances.map((b) => b.member)).find((m) => m.id === bill.memberId);
    const owed = member && payablesIn(computed, member.id)?.payables;
    if (!member || owed?.kind !== "owes" || owed.left === 0) continue;
    const last = reminders.find((r) => r.periodId === bill.periodId && r.memberId === member.id);
    if (!unpaidReminderDue({ billSentAt: bill.sentAt, lastReminderAt: last?.sentAt ?? null, today })) continue;
    const latest = computed.all.at(-1)!;
    const email = unpaidEmail({
      name: member.name,
      year: bill.year,
      month: bill.month,
      left: owed.left,
      waiting: owed.waiting,
      collectorName: computed.period.balances.find((b) => b.member.isCollector)?.member.name ?? "the admin",
      link: appLink(`/periods/${latest.year}/${latest.month}/settle`),
    });
    const push = unpaidPush({ year: bill.year, month: bill.month, path: `/periods/${latest.year}/${latest.month}/settle` });
    await sendAgain(bill.periodId, member, last ?? null, email, outcome, push);
  }
}

/**
 * Like sendOnce, for the follow-up that repeats: its one row's time moves forward each time.
 * Only the run that moves it from the time it read sends (Vercel can call a cron twice), and a
 * failed send puts the old time back so the next day's run retries. The push, like sendOnce's,
 * only once the email has gone.
 */
async function sendAgain(
  periodId: number,
  to: Recipient,
  last: { id: number; sentAt: Date } | null,
  email: Email,
  outcome: ReminderOutcome,
  push: Push,
) {
  const live = emailIsLive();
  if (live) {
    const claimed = last
      ? await db
          .update(reminderSends)
          .set({ sentAt: new Date() })
          // To the millisecond: Postgres keeps microseconds, a JS Date only milliseconds.
          .where(
            and(
              eq(reminderSends.id, last.id),
              sql`date_trunc('milliseconds', ${reminderSends.sentAt}) = ${last.sentAt.toISOString()}::timestamptz`,
            ),
          )
          .returning({ id: reminderSends.id })
      : await db
          .insert(reminderSends)
          .values({ periodId, kind: "unpaid", memberId: to.id })
          .onConflictDoNothing()
          .returning({ id: reminderSends.id });
    if (claimed.length === 0) return;
  }
  try {
    await sendEmail(to.email, to.name, email);
    outcome.sent.push(`unpaid → ${to.name}`);
  } catch (error) {
    console.error(`Couldn't send the unpaid email to ${to.name}`, error);
    outcome.failed.push(`unpaid → ${to.name}`);
    if (live) {
      const mine = and(eq(reminderSends.periodId, periodId), eq(reminderSends.kind, "unpaid"), eq(reminderSends.memberId, to.id));
      if (last) await db.update(reminderSends).set({ sentAt: last.sentAt }).where(mine);
      else await db.delete(reminderSends).where(mine);
    }
    return;
  }
  if (PUSHES.unpaid) await sendPush([to], push);
}

/**
 * Emails each housemate their own bill for a month (Settle Up → "Email everyone their bill"):
 * what they owe, or get back, and a link to the latest month's Settle Up, where "I paid" goes.
 * Nobody sees anyone else's amount, and nobody settled is emailed. View-only logins get a "the
 * bills are in" note (billsInEmail), the first time only. The caller checks it's the admin
 * (run("admin", …)). Throws an ActionError saying who it couldn't reach.
 */
export async function sendPayables(periodId: number): Promise<void> {
  const target = await db.query.billingPeriods.findFirst({ where: eq(billingPeriods.id, periodId) });
  if (!target) throw new ActionError("That month no longer exists.");
  const computed = await computeForPayables(db, target.year, target.month);
  if (!computed) throw new ActionError("That month no longer exists.");
  const check = payablesCheck(computed.issue, pendingBillNames(computed.period));
  if (!check.ok) throw new ActionError(check.reason!);

  const inMonth = computed.period.balances.map((b) => b.member);
  const collectorName = inMonth.find((m) => m.isCollector)?.name ?? "the admin";
  const latest = computed.all.at(-1)!;
  const settlePath = `/periods/${latest.year}/${latest.month}/settle`;
  const link = appLink(settlePath);
  const live = emailIsLive();
  const sent: string[] = [];
  const failed: string[] = [];
  // The "bill ready" pushes, to whoever the email reached. Sent after the response, so the button
  // never waits on a push service; registered first, so they go even if a send below throws.
  const pushes: (() => Promise<void>)[] = [];
  after(() => Promise.all(pushes.map((send) => send())));
  for (const member of recipientsOf(inMonth)) {
    const owed = payablesIn(computed, member.id);
    if (!owed) continue;
    const email = payablesEmail({
      name: member.name,
      year: target.year,
      month: target.month,
      payables: owed.payables,
      carriedOver: owed.carriedOver,
      collectorName,
      link,
    });
    if (!email) continue;
    try {
      await sendEmail(member.email, member.name, email);
      sent.push(member.name);
    } catch (error) {
      // Missing settings: say so, instead of "try again" for each person.
      if (error instanceof EmailNotSetUpError) throw new ActionError(error.message);
      console.error(`Couldn't send the bill email to ${member.name}`, error);
      failed.push(member.name);
      continue;
    }
    // A resend is on purpose, so it just moves the time.
    if (live) {
      await db
        .insert(reminderSends)
        .values({ periodId, kind: "payables", memberId: member.id })
        .onConflictDoUpdate({
          target: [reminderSends.periodId, reminderSends.kind, reminderSends.memberId],
          set: { sentAt: new Date() },
        });
    }
    const push = billReadyPush({ year: target.year, month: target.month, payables: owed.payables, path: settlePath });
    if (push && PUSHES.payables) pushes.push(() => sendPush([member], push));
  }

  // View-only logins: a "the bills are in" note, once per month (a resend doesn't repeat it).
  const viewOnly = await db.query.members.findMany({
    where: and(eq(members.role, "view_only"), eq(members.active, true)),
    orderBy: [asc(members.sortOrder), asc(members.id)],
  });
  const monthLink = appLink(`/periods/${target.year}/${target.month}`);
  for (const member of viewOnly) {
    if (!member.email) continue;
    const notes = { sent: [] as string[], failed: [] as string[] };
    const email = billsInEmail({ name: member.name, year: target.year, month: target.month, link: monthLink });
    const error = await sendOnce(periodId, "bills_in", { id: member.id, name: member.name, email: member.email }, email, notes);
    if (error instanceof EmailNotSetUpError) throw new ActionError(error.message);
    if (notes.sent.length) sent.push(member.name);
    if (notes.failed.length) failed.push(member.name);
  }

  if (failed.length) {
    const reached = sent.length ? `Sent to ${sent.join(", ")}, but couldn't` : "Couldn't";
    throw new ActionError(`${reached} send to ${failed.join(", ")}. Try again in a moment.`);
  }
  if (sent.length === 0) throw new ActionError("Nobody has anything to pay or get back, so no email was sent.");
}
