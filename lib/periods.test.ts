// Carrying money from one month to the next (computePeriod) and what's still owed after a bill
// email (payablesIn), against a real Postgres (PGlite: docs/testing.md → Database tests), from the
// made-up August 2026. What's expected is worked out by hand from docs/settlement-rules.md
// ("Carry-over is live" and "After a closed month" under Payments, "What's still owed after a
// bill email"), never the app's own output.

import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { advances, billingPeriods, payments, periodBalances, sharedColumns } from "@/db/schema";
import { loadAugust, type LoadedAugust } from "@/lib/__fixtures__/load-august";
import type { MemberName } from "@/lib/__fixtures__/august-2026";
import { closeMonthIn } from "@/lib/month-close";
import { startNextMonthIn } from "@/lib/month-start";
import { toCentavos } from "@/lib/money";
import { computeForPayables, computePeriod, payablesIn } from "@/lib/periods";
import { resetDb, testDatabase } from "./test-db";

vi.mock("server-only", () => ({}));
vi.mock("@/db", async () => (await import("./test-db")).dbModule());
vi.mock("@/lib/auth", () => ({}));

/**
 * August's Finals, by hand (lib/settlement.test.ts → "the worked example"). The fixture opens on
 * ₱0 with no payments, so each is also what that member carries into September.
 */
const AUGUST_FINALS: Record<MemberName, string> = {
  Ana: "15353.91",
  Ben: "10105.83",
  Cara: "-15059.19",
  Dan: "5362.76",
  PA: "-15763.29",
};

const { pg, db } = await testDatabase();
let august: LoadedAugust;

beforeEach(async () => {
  await resetDb(pg);
  august = await db.transaction((tx) => loadAugust(tx));
});

const closeAugust = () => db.transaction((tx) => closeMonthIn(tx, august.periodId));
const startSeptember = () => db.transaction((tx) => startNextMonthIn(tx));

async function septemberId() {
  const [row] = await db
    .select({ id: billingPeriods.id })
    .from(billingPeriods)
    .where(and(eq(billingPeriods.year, 2026), eq(billingPeriods.month, 9)));
  return row.id;
}

async function septemberOpenings() {
  const computed = (await computePeriod(db, 2026, 9))!;
  expect(computed.issue).toBeNull();
  return new Map(computed.result!.rows.map((r) => [r.member.id, r.opening]));
}

/** A payment from `name` into the House Budget, made in September (or `periodId`). */
async function payIn(
  name: MemberName,
  amount: string,
  status: "confirmed" | "pending" | "rejected" = "confirmed",
  periodId?: number,
) {
  await db.insert(payments).values({
    periodId: periodId ?? (await septemberId()),
    fromMemberId: august.idOf(name),
    toMemberId: null,
    amount,
    paidOn: "2026-09-03",
    status,
    rejectedReason: status === "rejected" ? "Not in the account" : null,
  });
}

/** The House Budget paying `name` back in September. */
async function payOut(name: MemberName, amount: string) {
  await db.insert(payments).values({
    periodId: await septemberId(),
    fromMemberId: null,
    toMemberId: august.idOf(name),
    amount,
    paidOn: "2026-09-03",
  });
}

/** A ₱5,000.00 advance `name` paid in September, through Advances Shared (₱1,000.00 each). */
async function advanceInSeptember(name: MemberName) {
  const periodId = await septemberId();
  const [column] = await db
    .select({ id: sharedColumns.id })
    .from(sharedColumns)
    .where(eq(sharedColumns.periodId, periodId));
  await db.insert(advances).values({
    periodId,
    columnId: column.id,
    payerId: august.idOf(name),
    category: "grocery",
    description: "Groceries",
    amount: "5000.00",
    spentOn: "2026-09-02",
  });
}

const owedIn = async (month: number, name: MemberName) =>
  payablesIn((await computeForPayables(db, 2026, month))!, august.idOf(name));
const owedInSeptember = (name: MemberName) => owedIn(9, name);

describe("carry-over between months", () => {
  it("opens a month with the open month before's Finals, worked out live", async () => {
    // Ana pays ₱5,000.00 of August in August: her Final, and so her September opening, is
    // ₱15,353.91 − ₱5,000.00 = ₱10,353.91 (the Final, not the Month Final).
    await payIn("Ana", "5000.00", "confirmed", august.periodId);
    await startSeptember();
    // After an open month the stored openings are ₱0 (lib/month-start.test.ts), so these can
    // only come from working August out again.
    const openings = await septemberOpenings();
    expect(openings.get(august.idOf("Ana"))).toBe(1_035_391);
    for (const name of ["Ben", "Cara", "Dan", "PA"] as const) {
      expect(openings.get(august.idOf(name)), name).toBe(toCentavos(AUGUST_FINALS[name]));
    }
  });

  it("uses the stored openings once the month before is closed", async () => {
    await closeAugust();
    await startSeptember();
    // A stored opening that differs from August's Final shows which one is read.
    await db
      .update(periodBalances)
      .set({ openingBalance: "1.00" })
      .where(and(eq(periodBalances.periodId, await septemberId()), eq(periodBalances.memberId, august.idOf("Dan"))));

    const openings = await septemberOpenings();
    expect(openings.get(august.idOf("Dan"))).toBe(100);
    for (const name of ["Ana", "Ben", "Cara", "PA"] as const) {
      expect(openings.get(august.idOf(name)), name).toBe(toCentavos(AUGUST_FINALS[name]));
    }
  });
});

describe("what's still owed from last month (carriedOver)", () => {
  it("takes off what's been paid in since, confirmed only", async () => {
    await startSeptember();
    // Ben carries ₱10,105.83 in from August and pays ₱5,000.00 of it: ₱5,105.83 still unpaid.
    // PA's ₱5,000.00 advance adds ₱1,000.00 to his share, so his September Final is
    // ₱10,105.83 + ₱1,000.00 − ₱5,000.00 = ₱6,105.83: what's carried over isn't the Final.
    await payIn("Ben", "5000.00");
    await advanceInSeptember("PA");
    expect(await owedInSeptember("Ben")).toEqual({
      carriedOver: 510_583,
      payables: { kind: "owes", due: 610_583, waiting: 0, left: 610_583 },
    });

    // An "I paid" still waiting for PA and a rejected one don't count as paid.
    await payIn("Ben", "1000.00", "pending");
    await payIn("Ben", "2000.00", "rejected");
    expect(await owedInSeptember("Ben")).toEqual({
      carriedOver: 510_583,
      payables: { kind: "owes", due: 610_583, waiting: 100_000, left: 510_583 },
    });
  });

  it("is never below ₱0 for someone the House Budget owes", async () => {
    await startSeptember();
    // Cara is owed ₱15,059.19: nothing carried over for her to pay.
    expect(await owedInSeptember("Cara")).toEqual({
      carriedOver: 0,
      payables: { kind: "owed", amount: 1_505_919 },
    });
  });
});

describe("August's bill, paid in September", () => {
  it("takes off a payment made in a later month", async () => {
    await startSeptember();
    // Ben pays ₱5,000.00 in September, and PA's ₱5,000.00 advance adds ₱1,000.00 to his share:
    // his September Final is ₱10,105.83 + ₱1,000.00 − ₱5,000.00 = ₱6,105.83. For August's bill
    // he still owes ₱10,105.83 − ₱5,000.00 = ₱5,105.83, under that cap. (Not taking the later
    // payment off would show the cap, ₱6,105.83.)
    await payIn("Ben", "5000.00");
    await advanceInSeptember("PA");
    expect(await owedIn(8, "Ben")).toEqual({
      carriedOver: 0, // August opened on ₱0
      payables: { kind: "owes", due: 510_583, waiting: 0, left: 510_583 },
    });
  });

  it("is capped by what they owe overall now", async () => {
    await startSeptember();
    // Dan pays a ₱5,000.00 advance in September and his share of it is ₱1,000.00: his September
    // Final is ₱5,362.76 + ₱1,000.00 − ₱5,000.00 = ₱1,362.76. That's all he owes for August now,
    // with no payment.
    await advanceInSeptember("Dan");
    expect(await owedIn(8, "Dan")).toEqual({
      carriedOver: 0,
      payables: { kind: "owes", due: 136_276, waiting: 0, left: 136_276 },
    });
  });

  it("takes off the House Budget paying someone back in a later month", async () => {
    await startSeptember();
    // Cara is owed ₱15,059.19 for August. In September she pays a ₱5,000.00 advance (her share
    // ₱1,000.00) and the House Budget pays her ₱5,000.00 back: her September Final is
    // −₱15,059.19 − ₱4,000.00 + ₱5,000.00 = −₱14,059.19. For August she's still owed
    // ₱15,059.19 − ₱5,000.00 = ₱10,059.19, under that cap. (Not taking the payback off would
    // show the cap, ₱14,059.19.)
    await advanceInSeptember("Cara");
    await payOut("Cara", "5000.00");
    expect(await owedIn(8, "Cara")).toEqual({
      carriedOver: 0,
      payables: { kind: "owed", amount: 1_005_919 },
    });
  });
});
