import { describe, expect, it } from "vitest";
import {
  adminNudge,
  billDueReminderDue,
  billsComingUp,
  billsDue,
  comingUpText,
  daysLeftIn,
  dueIn,
  dueWhen,
  housemateNotice,
  type DueBillRow,
  type DueInboxRow,
  lastDayName,
  lastDayOf,
  payablesOf,
  reminderDue,
  seenAfter,
  unpaidReminderDue,
} from "@/lib/reminders";

describe("lastDayOf / lastDayName", () => {
  it("knows each month's length, leap years included", () => {
    expect(lastDayOf(2026, 10)).toBe(31);
    expect(lastDayOf(2026, 9)).toBe(30);
    expect(lastDayOf(2026, 2)).toBe(28);
    expect(lastDayOf(2028, 2)).toBe(29);
    expect(lastDayOf(2026, 12)).toBe(31);
    expect(lastDayName(2026, 10)).toBe("the 31st");
    expect(lastDayName(2026, 9)).toBe("the 30th");
    expect(lastDayName(2026, 2)).toBe("the 28th");
    expect(lastDayName(2028, 2)).toBe("the 29th");
  });
});

describe("daysLeftIn", () => {
  it("counts to the last day, and is null outside the month", () => {
    expect(daysLeftIn(2026, 10, "2026-10-24")).toBe(7);
    expect(daysLeftIn(2026, 10, "2026-10-31")).toBe(0);
    expect(daysLeftIn(2026, 10, "2026-11-01")).toBeNull();
    expect(daysLeftIn(2026, 10, "2025-10-24")).toBeNull();
  });
});

describe("reminderDue", () => {
  it("sends the week reminder 7 days before a 31-day month ends, not 8", () => {
    expect(reminderDue(2026, 10, "2026-10-23")).toBeNull();
    expect(reminderDue(2026, 10, "2026-10-24")).toBe("week");
  });

  it("sends the 3-day and last-day reminders", () => {
    expect(reminderDue(2026, 10, "2026-10-28")).toBe("three_days");
    expect(reminderDue(2026, 10, "2026-10-31")).toBe("last_day");
  });

  it("works for 30- and 28-day months", () => {
    expect(reminderDue(2026, 9, "2026-09-23")).toBe("week");
    expect(reminderDue(2026, 9, "2026-09-27")).toBe("three_days");
    expect(reminderDue(2026, 2, "2026-02-21")).toBe("week");
    expect(reminderDue(2026, 2, "2026-02-20")).toBeNull();
    expect(reminderDue(2026, 2, "2026-02-28")).toBe("last_day");
  });

  it("keeps answering with the latest reminder reached, so a missed day is caught up", () => {
    // The job didn't run on the 24th: the 25th still owes the week reminder.
    expect(reminderDue(2026, 10, "2026-10-25")).toBe("week");
    expect(reminderDue(2026, 10, "2026-10-27")).toBe("week");
    // Missed the 28th: the 29th and 30th still owe the 3-day one.
    expect(reminderDue(2026, 10, "2026-10-30")).toBe("three_days");
  });

  it("sends nothing once the month is over, or for another month", () => {
    expect(reminderDue(2026, 10, "2026-11-01")).toBeNull();
    expect(reminderDue(2026, 10, "2026-09-30")).toBeNull();
  });
});

describe("unpaidReminderDue", () => {
  // The bill went out Oct. 31, 9:14 PM Manila (UTC+8).
  const billSentAt = new Date("2026-10-31T13:14:00Z");
  // The first follow-up went out Nov. 3, 9:05 AM Manila.
  const firstReminder = new Date("2026-11-03T01:05:00Z");

  it("sends the first one 3 days after the bill email, not 2", () => {
    expect(unpaidReminderDue({ billSentAt, lastReminderAt: null, today: "2026-11-02" })).toBe(false);
    expect(unpaidReminderDue({ billSentAt, lastReminderAt: null, today: "2026-11-03" })).toBe(true);
  });

  it("catches up a day the job missed", () => {
    expect(unpaidReminderDue({ billSentAt, lastReminderAt: null, today: "2026-11-05" })).toBe(true);
  });

  it("then sends one 4 days after the last, not 3", () => {
    expect(unpaidReminderDue({ billSentAt, lastReminderAt: firstReminder, today: "2026-11-03" })).toBe(false);
    expect(unpaidReminderDue({ billSentAt, lastReminderAt: firstReminder, today: "2026-11-06" })).toBe(false);
    expect(unpaidReminderDue({ billSentAt, lastReminderAt: firstReminder, today: "2026-11-07" })).toBe(true);
  });

  it("starts the count again when the bill is sent again", () => {
    // Resent Nov. 5, 10 AM Manila, after the Nov. 3 follow-up: next one Nov. 8, not Nov. 10.
    const resent = new Date("2026-11-05T02:00:00Z");
    expect(unpaidReminderDue({ billSentAt: resent, lastReminderAt: firstReminder, today: "2026-11-07" })).toBe(false);
    expect(unpaidReminderDue({ billSentAt: resent, lastReminderAt: firstReminder, today: "2026-11-08" })).toBe(true);
  });

  it("starts the count again even when the bill is resent the same day as a follow-up", () => {
    // Resent Nov. 3 at noon Manila, after that morning's follow-up: next one Nov. 6.
    const resent = new Date("2026-11-03T04:00:00Z");
    expect(unpaidReminderDue({ billSentAt: resent, lastReminderAt: firstReminder, today: "2026-11-05" })).toBe(false);
    expect(unpaidReminderDue({ billSentAt: resent, lastReminderAt: firstReminder, today: "2026-11-06" })).toBe(true);
  });

  it("counts Manila days, not UTC ones", () => {
    // Nov. 1, 7:30 AM Manila is still Oct. 31 in UTC: 3 days from Nov. 1 is Nov. 4.
    const morning = new Date("2026-10-31T23:30:00Z");
    expect(unpaidReminderDue({ billSentAt: morning, lastReminderAt: null, today: "2026-11-03" })).toBe(false);
    expect(unpaidReminderDue({ billSentAt: morning, lastReminderAt: null, today: "2026-11-04" })).toBe(true);
  });
});

describe("billsDue", () => {
  // The made-up August 2026: its bills fall due in early September.
  const bill = (over: Partial<DueBillRow>): DueBillRow => ({
    id: 1,
    name: "Meralco",
    periodId: 8,
    year: 2026,
    month: 8,
    kind: "standard",
    dueDate: "2026-09-06",
    paidOn: null,
    total: 1_250_754,
    pending: false,
    ...over,
  });
  const email = (over: Partial<DueInboxRow>): DueInboxRow => ({
    emailId: 5,
    name: "PLDT Wifi",
    year: 2026,
    month: 8,
    dueDate: "2026-09-04",
    column: { dueDate: null, paidOn: null },
    ...over,
  });

  it("lists unpaid bills due within a week or overdue, soonest first, with the days left", () => {
    const due = billsDue(
      [
        bill({ id: 1, name: "Meralco", dueDate: "2026-09-06" }),
        bill({ id: 2, name: "Water", dueDate: "2026-09-03" }),
        // Overdue: still listed, however late.
        bill({ id: 3, name: "PLDT Wifi", dueDate: "2026-08-20" }),
        // 8 days away: not yet.
        bill({ id: 4, name: "Rent", dueDate: "2026-09-09" }),
      ],
      [],
      "2026-09-01",
    );
    expect(due.map((d) => [d.name, d.daysLeft])).toEqual([
      ["PLDT Wifi", -12],
      ["Water", 2],
      ["Meralco", 5],
    ]);
  });

  it("leaves out paid, undated, ₱0 and Helper bills, and keeps pending ones (flagged)", () => {
    const due = billsDue(
      [
        bill({ id: 1, paidOn: "2026-08-31" }),
        bill({ id: 2, dueDate: null }),
        bill({ id: 3, total: 0 }),
        bill({ id: 4, name: "Helper", kind: "helper" }),
        bill({ id: 5, name: "Water", pending: true }),
      ],
      [],
      "2026-09-01",
    );
    expect(due).toEqual([
      expect.objectContaining({ source: "bill", id: 5, name: "Water", pending: true, daysLeft: 5, total: 1_250_754 }),
    ]);
  });

  it("lists a Bill inbox email unless its column already has a Due date or a Date paid", () => {
    const due = (column: DueInboxRow["column"]) => billsDue([], [email({ column })], "2026-09-01");
    expect(due(null)).toEqual([
      { source: "inbox", emailId: 5, name: "PLDT Wifi", year: 2026, month: 8, dueDate: "2026-09-04", daysLeft: 3 },
    ]);
    expect(due({ dueDate: null, paidOn: null })).toHaveLength(1);
    // The column shows it itself (from its own Due date)…
    expect(due({ dueDate: "2026-09-04", paidOn: null })).toEqual([]);
    // …or it's been paid.
    expect(due({ dueDate: null, paidOn: "2026-09-01" })).toEqual([]);
    expect(billsDue([], [email({ dueDate: null })], "2026-09-01")).toEqual([]);
    expect(billsDue([], [email({ dueDate: "2026-09-20" })], "2026-09-01")).toEqual([]);
  });
});

describe("billsComingUp", () => {
  it("keeps bill columns due today or later: no overdue ones, no Bill inbox emails", () => {
    const all = billsDue(
      [
        { id: 1, name: "PLDT Wifi", periodId: 8, year: 2026, month: 8, kind: "standard", dueDate: "2026-08-30", paidOn: null, total: 189_900, pending: false },
        { id: 2, name: "Water", periodId: 8, year: 2026, month: 8, kind: "standard", dueDate: "2026-09-01", paidOn: null, total: 194_863, pending: false },
        { id: 3, name: "Meralco", periodId: 8, year: 2026, month: 8, kind: "standard", dueDate: "2026-09-06", paidOn: null, total: 1_250_754, pending: true },
      ],
      [{ emailId: 5, name: "Rent", year: 2026, month: 8, dueDate: "2026-09-02", column: null }],
      "2026-09-01",
    );
    expect(all.map((b) => b.name)).toEqual(["PLDT Wifi", "Water", "Rent", "Meralco"]);
    expect(billsComingUp(all).map((b) => [b.name, b.daysLeft])).toEqual([
      ["Water", 0],
      ["Meralco", 5],
    ]);
    expect(comingUpText(billsComingUp(all), "PA")).toBe(
      "Coming up: Water today · Meralco Sept. 6. PA pays these billers, nothing for you to do.",
    );
    expect(comingUpText([{ name: "Water", dueDate: "2026-09-02", daysLeft: 1 }], "PA")).toBe(
      "Coming up: Water tomorrow. PA pays this biller, nothing for you to do.",
    );
  });
});

describe("billDueReminderDue", () => {
  // Due Sept. 6: the steps are Sept. 3 (3 days before), Sept. 6 and Sept. 7 (the day after).
  const due = (today: string, lastSentOn: string | null, dueDates = ["2026-09-06"]) =>
    billDueReminderDue({ dueDates, lastSentOn, today });

  it("is due on each step, once", () => {
    expect(due("2026-09-02", null)).toBe(false);
    expect(due("2026-09-03", null)).toBe(true);
    expect(due("2026-09-03", "2026-09-03")).toBe(false);
    expect(due("2026-09-05", "2026-09-03")).toBe(false);
    expect(due("2026-09-06", "2026-09-03")).toBe(true);
    expect(due("2026-09-07", "2026-09-06")).toBe(true);
    expect(due("2026-09-08", "2026-09-07")).toBe(false);
    expect(due("2026-09-20", "2026-09-07")).toBe(false);
  });

  it("catches up a day the job missed", () => {
    // Nothing went out on Sept. 3 (the database paused): Sept. 4 sends it.
    expect(due("2026-09-04", "2026-08-30")).toBe(true);
  });

  it("never digs up a step more than a week old", () => {
    // Sept. 7 + 7 = Sept. 14 is the last day the day-after step can still go out.
    expect(due("2026-09-14", null)).toBe(true);
    expect(due("2026-09-15", null)).toBe(false);
  });

  it("goes by any of the month's bills", () => {
    // Water (due Sept. 3) was told on its due day; Meralco's 3-days-before step is the same day.
    expect(due("2026-09-03", null, ["2026-09-03", "2026-09-06"])).toBe(true);
    // Sept. 4: Water's day-after step.
    expect(due("2026-09-04", "2026-09-03", ["2026-09-03", "2026-09-06"])).toBe(true);
    expect(due("2026-09-05", "2026-09-04", ["2026-09-03", "2026-09-06"])).toBe(false);
    expect(due("2026-09-03", null, [])).toBe(false);
  });
});

describe("dueWhen", () => {
  it("says when, in the household's words", () => {
    expect(dueWhen({ daysLeft: 3, dueDate: "2026-09-06" })).toBe("due in 3 days (Sept. 6)");
    expect(dueWhen({ daysLeft: 1, dueDate: "2026-09-06" })).toBe("due tomorrow (Sept. 6)");
    expect(dueWhen({ daysLeft: 0, dueDate: "2026-09-06" })).toBe("due today");
    expect(dueWhen({ daysLeft: -1, dueDate: "2026-09-06" })).toBe("1 day overdue (due Sept. 6)");
    expect(dueWhen({ daysLeft: -4, dueDate: "2026-09-06" })).toBe("4 days overdue (due Sept. 6)");
  });

  it("and the banner's short pill", () => {
    expect([3, 1, 0, -1, -4].map(dueIn)).toEqual(["in 3 days", "tomorrow", "today", "1 day overdue", "4 days overdue"]);
  });
});

describe("seenAfter", () => {
  const sent = new Date("2026-10-31T01:00:00Z");

  it("is the seen time only once it's at or after the send", () => {
    expect(seenAfter(sent, null)).toBeNull();
    const after = new Date("2026-11-01T02:00:00Z");
    expect(seenAfter(sent, after)).toBe(after);
    expect(seenAfter(sent, sent)).toBe(sent);
  });

  it("drops a seen from before the bill was sent again", () => {
    expect(seenAfter(sent, new Date("2026-10-30T12:00:00Z"))).toBeNull();
  });
});

describe("payablesOf", () => {
  const paid = (amount: number, status: "confirmed" | "pending" | "rejected", later: boolean, direction: "in" | "out" = "in") => ({
    amount,
    status,
    later,
    direction,
  });

  it("is the Final when nothing has been paid since", () => {
    expect(payablesOf(250_000, [])).toEqual({ kind: "owes", due: 250_000, waiting: 0, left: 250_000 });
  });

  it("takes off a waiting I paid, here or later, but not a rejected one", () => {
    const payments = [paid(100_000, "pending", false), paid(50_000, "rejected", true)];
    expect(payablesOf(250_000, payments)).toEqual({ kind: "owes", due: 250_000, waiting: 100_000, left: 150_000 });
  });

  it("ignores this month's confirmed payments (already in the Final) but takes off later ones", () => {
    const payments = [paid(99_999, "confirmed", false), paid(200_000, "confirmed", true)];
    // ₱2,500.00 − ₱2,000.00 paid in the next month = ₱500.00.
    expect(payablesOf(250_000, payments)).toEqual({ kind: "owes", due: 50_000, waiting: 0, left: 50_000 });
  });

  it("is waiting when everything left was sent with I paid", () => {
    expect(payablesOf(250_000, [paid(300_000, "pending", true)])).toEqual({
      kind: "owes",
      due: 250_000,
      waiting: 250_000,
      left: 0,
    });
  });

  it("is settled once paid in full, or when the Final is ₱0", () => {
    expect(payablesOf(250_000, [paid(250_000, "confirmed", true)])).toEqual({ kind: "settled" });
    expect(payablesOf(0, [])).toEqual({ kind: "settled" });
  });

  it("ignores money paid out to someone who owes", () => {
    expect(payablesOf(250_000, [paid(100_000, "confirmed", true, "out")])).toEqual({
      kind: "owes",
      due: 250_000,
      waiting: 0,
      left: 250_000,
    });
  });

  it("is never more than they owe overall now (the latest Final)", () => {
    // Ben owes ₱1,000.00 for September; October's own numbers (advances he paid) bring his
    // latest Final to ₱0.00 — nothing more to pay, though no payment was made.
    expect(payablesOf(100_000, [], 0)).toEqual({ kind: "settled" });
    // Latest Final ₱400.00: only ₱400.00 of September's ₱1,000.00 is still to pay.
    expect(payablesOf(100_000, [], 40_000)).toEqual({ kind: "owes", due: 40_000, waiting: 0, left: 40_000 });
    // A latest Final above it (new spending since) doesn't raise the bill's amount.
    expect(payablesOf(100_000, [], 250_000)).toEqual({ kind: "owes", due: 100_000, waiting: 0, left: 100_000 });
    // Owed overall now (negative latest Final): nothing to pay.
    expect(payablesOf(100_000, [], -5_000)).toEqual({ kind: "settled" });
  });

  it("caps after later payments, and shows waiting payments against the capped amount", () => {
    // ₱1,000.00 owed, ₱600.00 paid in October, latest Final ₱300.00: ₱300.00 left, not ₱400.00.
    expect(payablesOf(100_000, [paid(60_000, "confirmed", true)], 30_000)).toEqual({
      kind: "owes",
      due: 30_000,
      waiting: 0,
      left: 30_000,
    });
    // ₱1,000.00 sent with I paid (waiting), latest Final ₱800.00: all ₱800.00 of it is waiting.
    expect(payablesOf(100_000, [paid(100_000, "pending", true)], 80_000)).toEqual({
      kind: "owes",
      due: 80_000,
      waiting: 80_000,
      left: 0,
    });
  });

  it("is never more owed back than they're owed overall now", () => {
    // Cara is owed ₱1,000.00 for September; October brings her latest Final to ₱0.00.
    expect(payablesOf(-100_000, [], 0)).toEqual({ kind: "settled" });
    expect(payablesOf(-100_000, [], -30_000)).toEqual({ kind: "owed", amount: 30_000 });
    expect(payablesOf(-100_000, [], -250_000)).toEqual({ kind: "owed", amount: 100_000 });
    // Owing overall now (positive latest Final): nothing to get back.
    expect(payablesOf(-100_000, [], 5_000)).toEqual({ kind: "settled" });
  });

  it("is owed back when the Final is negative, less what's been paid back since", () => {
    expect(payablesOf(-12_345, [])).toEqual({ kind: "owed", amount: 12_345 });
    // ₱123.45 owed, ₱100.00 paid back in the next month: ₱23.45 left. Their own "I paid"s don't count.
    expect(payablesOf(-12_345, [paid(10_000, "confirmed", true, "out"), paid(5_000, "confirmed", true)])).toEqual({
      kind: "owed",
      amount: 2_345,
    });
    expect(payablesOf(-12_345, [paid(12_345, "confirmed", true, "out")])).toEqual({ kind: "settled" });
  });
});

describe("adminNudge", () => {
  const ready = {
    periodId: 9,
    year: 2026,
    month: 10,
    status: "open" as const,
    ended: true,
    issue: null,
    pendingBills: [],
    emptyBills: [],
    billEmailed: false,
    canClose: true,
    everyoneSettled: false,
  };

  it("nudges to email the bill once every bill is in", () => {
    expect(adminNudge(ready)).toEqual({
      kind: "email_bill",
      periodId: 9,
      year: 2026,
      month: 10,
      text: "All of October's bills are in. Ready to email everyone their bill.",
    });
  });

  it("waits while a bill is pending, at ₱0, or the numbers don't work out", () => {
    expect(adminNudge({ ...ready, pendingBills: ["Meralco"] })).toBeNull();
    expect(adminNudge({ ...ready, emptyBills: ["Water"] })).toBeNull();
    expect(adminNudge({ ...ready, issue: "Shares don't add up" })).toBeNull();
  });

  it("says nothing once the bill went out and people are still paying", () => {
    expect(adminNudge({ ...ready, billEmailed: true })).toBeNull();
  });

  it("nudges to close once everyone has paid and closing is allowed", () => {
    expect(adminNudge({ ...ready, billEmailed: true, everyoneSettled: true })?.text).toBe(
      "Everyone has paid for October. Ready to close it.",
    );
    expect(adminNudge({ ...ready, billEmailed: true, everyoneSettled: true, canClose: false })).toBeNull();
  });

  it("only for an ended month that's still open", () => {
    expect(adminNudge({ ...ready, ended: false })).toBeNull();
    expect(adminNudge({ ...ready, status: "closed" })).toBeNull();
  });
});

describe("housemateNotice", () => {
  const october = { year: 2026, month: 10, status: "open" as const };
  const base = { bill: null, latest: october, today: "2026-10-12", collectorName: "PA" };
  const bill = { year: 2026, month: 9, waiting: 0, left: 150_000, settleHref: "/periods/2026/10/settle" };

  it("shows nothing mid-month with no bill out", () => {
    expect(housemateNotice(base)).toBeNull();
  });

  it("counts down the last week, then says it's the last day", () => {
    expect(housemateNotice({ ...base, today: "2026-10-24" })).toEqual({
      kind: "deadline",
      text: "7 days left to log your October expenses. It locks after the 31st.",
      lastDay: false,
    });
    expect(housemateNotice({ ...base, today: "2026-10-30" })?.text).toBe(
      "1 day left to log your October expenses. It locks after the 31st.",
    );
    expect(housemateNotice({ ...base, today: "2026-10-31" })).toEqual({
      kind: "deadline",
      text: "Today is the last day to log your October expenses. From tomorrow October is locked.",
      lastDay: true,
    });
  });

  it("says nothing about a deadline once the month has ended or is closed", () => {
    expect(housemateNotice({ ...base, today: "2026-11-01" })).toBeNull();
    expect(housemateNotice({ ...base, latest: { ...october, status: "closed" }, today: "2026-10-31" })).toBeNull();
  });

  it("puts the bill first, with what's left and what's waiting", () => {
    expect(housemateNotice({ ...base, today: "2026-10-31", bill })).toEqual({
      kind: "bill",
      text: "Your September 2026 bill is ready: ₱1,500.00 to pay.",
      href: "/periods/2026/10/settle",
    });
    expect(housemateNotice({ ...base, bill: { ...bill, waiting: 50_000, left: 100_000 } })?.text).toBe(
      "Your September 2026 bill is ready: ₱1,000.00 to pay (₱500.00 more is waiting for PA to confirm).",
    );
  });

  it("says it's waiting once everything is sent", () => {
    expect(housemateNotice({ ...base, bill: { ...bill, waiting: 150_000, left: 0 } })).toEqual({
      kind: "waiting",
      text: "Your payment for September 2026 is waiting for PA to confirm.",
    });
  });
});
