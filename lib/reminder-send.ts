// Sends My House's emails and records them (docs/features/reminders.md): the daily month-end
// reminders (app/api/reminders/route.ts, run by Vercel's cron) and Settle Up's "Email everyone
// their bill" (the emailPayables action). The rules and words are pure: lib/reminders.ts,
// lib/reminder-emails.ts.

import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { billingPeriods, db, reminderSends, type Member } from "@/db";
import { appLink, EmailNotSetUpError, emailIsLive, sendEmail } from "@/lib/email";
import { ActionError } from "@/lib/errors";
import { monthLabel } from "@/lib/format";
import { sharesCosts } from "@/lib/members";
import { monthHasEnded, payablesCheck } from "@/lib/month-lock";
import { startNextMonthIn } from "@/lib/month-start";
import { computeForPayables, payablesIn, pendingBillNames } from "@/lib/periods";
import { monthEndEmail, payablesEmail, readyEmail, startBlockedEmail, type Email } from "@/lib/reminder-emails";
import { findAdminNudge } from "@/lib/reminder-status";
import { daysLeftIn, reminderDue } from "@/lib/reminders";

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
function recipientsOf(members: readonly Member[]): Recipient[] {
  return members
    .filter((m) => !m.isCollector && sharesCosts(m) && m.email)
    .map((m) => ({ id: m.id, name: m.name, email: m.email! }));
}

/**
 * The daily job. `today` is Manila's date. Sends the month-end reminder due today to each
 * housemate (lib/reminders.ts → reminderDue); starts the next month once the latest has ended
 * (telling the admin when it can't); and emails the admin's "ready to email the bill" / "ready
 * to close" nudge. Each email is sent at most once.
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
      await sendOnce(current.id, due, member, email, outcome);
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
        await sendOnce(latest.id, "start_next", admin, email, outcome);
      }
    }
  }

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
    await sendOnce(nudge.periodId, nudge.kind === "email_bill" ? "ready_bill" : "ready_close", admin, email, outcome);
  }
  return outcome;
}

/**
 * Claims the reminder, then sends it. Only the run that wins the claim sends (Vercel can call a
 * cron twice), and a failed send gives the claim back so the next day's run retries just that
 * person. Off the live site nothing is claimed (lib/email.ts → safety switch).
 */
async function sendOnce(periodId: number, kind: ReminderKind, to: Recipient, email: Email, outcome: ReminderOutcome) {
  const live = emailIsLive();
  if (live) {
    const claimed = await db
      .insert(reminderSends)
      .values({ periodId, kind, memberId: to.id })
      .onConflictDoNothing()
      .returning({ id: reminderSends.id });
    if (claimed.length === 0) return;
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
  }
}

/**
 * Emails each housemate their own bill for a month (Settle Up → "Email everyone their bill"):
 * what they owe, or get back, and a link to the latest month's Settle Up, where "I paid" goes.
 * Nobody sees anyone else's amount, and nobody settled is emailed. The caller checks it's the
 * admin (run("admin", …)). Throws an ActionError saying who it couldn't reach.
 */
export async function sendPayables(periodId: number): Promise<void> {
  const target = await db.query.billingPeriods.findFirst({ where: eq(billingPeriods.id, periodId) });
  if (!target) throw new ActionError("That month no longer exists.");
  const computed = await computeForPayables(db, target.year, target.month);
  if (!computed) throw new ActionError("That month no longer exists.");
  const check = payablesCheck(computed.issue, pendingBillNames(computed.period));
  if (!check.ok) throw new ActionError(check.reason!);

  const members = computed.period.balances.map((b) => b.member);
  const collectorName = members.find((m) => m.isCollector)?.name ?? "the admin";
  const latest = computed.all.at(-1)!;
  const link = appLink(`/periods/${latest.year}/${latest.month}/settle`);
  const live = emailIsLive();
  const sent: string[] = [];
  const failed: string[] = [];
  for (const member of recipientsOf(members)) {
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
  }
  if (failed.length) {
    const reached = sent.length ? `Sent to ${sent.join(", ")}, but couldn't` : "Couldn't";
    throw new ActionError(`${reached} send to ${failed.join(", ")}. Try again in a moment.`);
  }
  if (sent.length === 0) throw new ActionError("Nobody has anything to pay or get back, so no email was sent.");
}
