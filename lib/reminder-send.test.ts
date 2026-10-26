// The daily job (lib/reminder-send.ts → runDailyReminders) against a real Postgres (PGlite:
// docs/testing.md → Database tests), with the made-up August 2026. Emails and pushes are caught
// here instead of sent. What it checks: each email goes out once (claim, then send), a failed
// one is retried the next run, the next month starts by itself, and the unpaid follow-ups' days
// (docs/features/reminders.md).
//
// Not shown here: two runs at the same instant (Vercel calling the cron twice). PGlite has one
// connection, so runs can only go one after the other; the claim's unique index is what keeps
// the second one out, and that's what the "run again" tests reach.

import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { billingPeriods, members, payments, reminderSends } from "@/db/schema";
import type { MemberName } from "@/lib/__fixtures__/august-2026";
import { loadAugust, type LoadedAugust } from "@/lib/__fixtures__/load-august";
import { runDailyReminders } from "@/lib/reminder-send";
import { UNPAID_REMINDER_DAYS } from "@/lib/reminders";
import { resetDb, testDatabase } from "./test-db";

const mail = vi.hoisted(() => ({
  live: true,
  /** Each email that went out: to whom (their name) and its subject. */
  sent: [] as { to: string; subject: string }[],
  /** Names whose next email fails (as if Gmail refused it). */
  failFor: new Set<string>(),
  sendPush: vi.fn(async () => {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", async () => (await import("./test-db")).dbModule());
vi.mock("@/lib/auth", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/push", () => ({ sendPush: mail.sendPush, pushToAdmin: vi.fn(async () => {}) }));
vi.mock("@/lib/email", () => ({
  emailIsLive: () => mail.live,
  appLink: (path: string) => `https://my-house.example${path}`,
  EmailNotSetUpError: class extends Error {},
  sendEmail: async (_to: string, toName: string, email: { subject: string }) => {
    if (mail.failFor.has(toName)) {
      mail.failFor.delete(toName);
      throw new Error("Gmail refused it");
    }
    mail.sent.push({ to: toName, subject: email.subject });
  },
}));

const { pg, db } = await testDatabase();
let august: LoadedAugust;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  mail.live = true;
  mail.sent = [];
  mail.failFor.clear();
  mail.sendPush.mockClear();
  await resetDb(pg);
  august = await db.transaction((tx) => loadAugust(tx));
  // Everyone has an email but Cara; PA (the collector) gets the admin's emails.
  for (const name of ["Ana", "Ben", "Dan", "PA"] as const) {
    await db.update(members).set({ email: `${name.toLowerCase()}@example.com` }).where(eq(members.id, august.idOf(name)));
  }
});

afterEach(() => {
  vi.useRealTimers();
});

/** The job's run on Manila's `today` (at 9am there, when Vercel's cron runs it). */
function runOn(today: string) {
  vi.setSystemTime(new Date(`${today}T01:00:00Z`));
  return runDailyReminders(today);
}

const claims = (kind: (typeof reminderSends.$inferSelect)["kind"]) =>
  db.select().from(reminderSends).where(eq(reminderSends.kind, kind));
const namesOf = async (rows: { memberId: number }[]) => {
  const all = await db.select().from(members);
  return rows.map((r) => all.find((m) => m.id === r.memberId)!.name).sort();
};
const sentTo = () => mail.sent.map((s) => s.to);

describe("month-end reminders", () => {
  it("emails each housemate in the month once: not the collector, not someone without an email", async () => {
    // 24 August: a week left.
    const outcome = await runOn("2026-08-24");
    expect(outcome.sent.sort()).toEqual(["week → Ana", "week → Ben", "week → Dan"]);
    expect(await namesOf(await claims("week"))).toEqual(["Ana", "Ben", "Dan"]);

    // Vercel calling it again, or the next day: already claimed, nothing goes out twice.
    mail.sent = [];
    expect((await runOn("2026-08-24")).sent).toEqual([]);
    expect((await runOn("2026-08-25")).sent).toEqual([]);
    expect(mail.sent).toEqual([]);
  });

  it("gives a failed email's claim back, so the next run retries only that person", async () => {
    mail.failFor.add("Ben");
    const first = await runOn("2026-08-24");
    expect(first.failed).toEqual(["week → Ben"]);
    expect(await namesOf(await claims("week"))).toEqual(["Ana", "Dan"]);

    const next = await runOn("2026-08-25");
    expect(next.sent).toEqual(["week → Ben"]);
    expect(await namesOf(await claims("week"))).toEqual(["Ana", "Ben", "Dan"]);
  });

  it("pushes each reminder, only after its email went", async () => {
    const pushedTo = () => mail.sendPush.mock.calls.map((call) => (call as unknown as [{ name: MemberName }[]])[0][0].name);
    await runOn("2026-08-24");
    expect(pushedTo().sort()).toEqual(["Ana", "Ben", "Dan"]);

    mail.sendPush.mockClear();
    mail.failFor.add("Dan");
    await runOn("2026-08-31");
    expect(pushedTo().sort()).toEqual(["Ana", "Ben"]);
  });

  it("off the live site, sends (to the test address) but records nothing", async () => {
    mail.live = false;
    await runOn("2026-08-24");
    expect(sentTo().sort()).toEqual(["Ana", "Ben", "Dan"]);
    expect(await db.select().from(reminderSends)).toEqual([]);
  });
});

describe("starting the next month by itself", () => {
  it("starts September once August has ended", async () => {
    const outcome = await runOn("2026-09-01");
    expect(outcome.month).toBe("started September 2026");
    const sep = await db.query.billingPeriods.findFirst({ where: and(eq(billingPeriods.year, 2026), eq(billingPeriods.month, 9)) });
    expect(sep?.status).toBe("open");
    // The next morning there's nothing to start: September hasn't ended.
    expect((await runOn("2026-09-02")).month).toBeUndefined();
  });

  it("off the live site, only checks it could", async () => {
    mail.live = false;
    expect((await runOn("2026-09-01")).month).toBe("would start September 2026");
    expect(await db.select().from(billingPeriods)).toHaveLength(1);
  });

  it("tells the admin once when it can't, and keeps trying every morning", async () => {
    await db.insert(payments).values({
      periodId: august.periodId,
      fromMemberId: august.idOf("Ben"),
      toMemberId: null,
      amount: "1000.00",
      paidOn: "2026-08-31",
      status: "pending",
    });
    const first = await runOn("2026-09-01");
    expect(first.month).toMatch(/^couldn't start: Confirm or reject the waiting payment first/);
    expect(first.sent).toContain("start_next → PA");

    const next = await runOn("2026-09-02");
    expect(next.month).toMatch(/^couldn't start/);
    expect(next.sent).not.toContain("start_next → PA");
    expect(await claims("start_next")).toHaveLength(1);
  });
});

describe("unpaid follow-ups", () => {
  /** August's bill emailed to Ben (he owes ₱10,105.83) on 2 September, 10am in Manila. */
  async function billSentToBen() {
    await db.insert(reminderSends).values({
      periodId: august.periodId,
      kind: "payables",
      memberId: august.idOf("Ben"),
      sentAt: new Date("2026-09-02T02:00:00Z"),
    });
  }
  const unpaidSent = (outcome: { sent: string[] }) => outcome.sent.filter((s) => s.startsWith("unpaid"));

  it(`follows up ${UNPAID_REMINDER_DAYS.first} days after the bill, then every ${UNPAID_REMINDER_DAYS.then} days`, async () => {
    await billSentToBen();
    expect(unpaidSent(await runOn("2026-09-04"))).toEqual([]);
    expect(unpaidSent(await runOn("2026-09-05"))).toEqual(["unpaid → Ben"]);
    expect(unpaidSent(await runOn("2026-09-06"))).toEqual([]);
    expect(unpaidSent(await runOn("2026-09-08"))).toEqual([]);
    expect(unpaidSent(await runOn("2026-09-09"))).toEqual(["unpaid → Ben"]);

    // One row for it, its time moved to the latest follow-up.
    const rows = await claims("unpaid");
    expect(rows).toHaveLength(1);
    expect(rows[0].sentAt.toISOString().slice(0, 10)).toBe("2026-09-09");
  });

  it("puts the old time back when a follow-up fails, so the next day retries it", async () => {
    await billSentToBen();
    await runOn("2026-09-05");
    const [before] = await claims("unpaid");

    mail.failFor.add("Ben");
    expect((await runOn("2026-09-09")).failed).toEqual(["unpaid → Ben"]);
    const [after] = await claims("unpaid");
    expect(after.sentAt.getTime()).toBe(before.sentAt.getTime());

    expect(unpaidSent(await runOn("2026-09-10"))).toEqual(["unpaid → Ben"]);
  });

  it("stops once they've paid", async () => {
    await billSentToBen();
    await db.insert(payments).values({
      periodId: august.periodId,
      fromMemberId: august.idOf("Ben"),
      toMemberId: null,
      amount: "10105.83",
      paidOn: "2026-09-03",
    });
    expect(unpaidSent(await runOn("2026-09-05"))).toEqual([]);
    expect(await claims("unpaid")).toEqual([]);
  });
});
