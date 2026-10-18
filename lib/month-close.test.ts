// Closing a month (lib/month-close.ts) against a real Postgres (PGlite: docs/testing.md → Database
// tests), with the made-up August 2026. The Finals expected here are the worked example's, worked
// out by hand (lib/settlement.test.ts, docs/settlement-rules.md), never the app's own output.

import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { billingPeriods, billItems, payments, periodBalances } from "@/db/schema";
import { loadAugust, type LoadedAugust } from "@/lib/__fixtures__/load-august";
import type { MemberName } from "@/lib/__fixtures__/august-2026";
import { closeMonthIn } from "@/lib/month-close";
import { startNextMonthIn } from "@/lib/month-start";
import { sumCentavos, toCentavos } from "@/lib/money";
import { resetDb, testDatabase } from "./test-db";

vi.mock("server-only", () => ({}));
vi.mock("@/db", async () => (await import("./test-db")).dbModule());
vi.mock("@/lib/auth", () => ({}));

/** August's Month Finals, by hand (lib/settlement.test.ts → "the worked example"). */
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

const close = (periodId = august.periodId) => db.transaction((tx) => closeMonthIn(tx, periodId));
const startNext = () => db.transaction((tx) => startNextMonthIn(tx));

async function balancesOf(periodId: number) {
  const rows = await db.select().from(periodBalances).where(eq(periodBalances.periodId, periodId));
  return new Map(rows.map((r) => [r.memberId, r]));
}

async function statusOf(periodId: number) {
  const [row] = await db.select().from(billingPeriods).where(eq(billingPeriods.id, periodId));
  return row;
}

/** Closing was refused with `reason`, and nothing was written. */
async function expectRefused(reason: RegExp) {
  await expect(close()).rejects.toThrow(reason);
  expect((await statusOf(august.periodId)).status).toBe("open");
  for (const b of (await balancesOf(august.periodId)).values()) expect(b.closingBalance).toBeNull();
}

describe("closing a month", () => {
  it("saves everyone's Final as their closing balance and locks the month", async () => {
    await close();
    const balances = await balancesOf(august.periodId);
    for (const [name, final] of Object.entries(AUGUST_FINALS) as [MemberName, string][]) {
      expect(balances.get(august.idOf(name))?.closingBalance, name).toBe(final);
    }
    // The Ice Maker column is typed ₱0.02 over, and that stays in the Finals (settlement-rules.md).
    expect(sumCentavos([...balances.values()].map((b) => toCentavos(b.closingBalance!)))).toBe(2);
    const period = await statusOf(august.periodId);
    expect(period.status).toBe("closed");
    expect(period.closedAt).toBeInstanceOf(Date);
  });

  it("refuses a month that's already closed", async () => {
    await close();
    await expect(close()).rejects.toThrow("This month is already closed.");
  });

  it("refuses while a bill is pending", async () => {
    await db.update(billItems).set({ status: "pending" }).where(eq(billItems.name, "Water"));
    await expectRefused(/Confirm or discard the pending Water bill first/);
  });

  it("refuses while a housemate's \"I paid\" is waiting", async () => {
    await db.insert(payments).values({
      periodId: august.periodId,
      fromMemberId: august.idOf("Ben"),
      toMemberId: null,
      amount: "1000.00",
      paidOn: "2026-09-01",
      status: "pending",
    });
    await expectRefused(/Confirm or reject the waiting payment first/);
  });

  it("refuses while the month before is still open", async () => {
    await db.insert(billingPeriods).values({ year: 2026, month: 7 });
    await expectRefused(/Close July 2026 first\./);
  });

  it("carries the Finals into the next month's opening balances", async () => {
    const september = await startNext();
    const [sep] = await db
      .select()
      .from(billingPeriods)
      .where(and(eq(billingPeriods.year, september.year), eq(billingPeriods.month, september.month)));
    await close();
    const openings = await balancesOf(sep.id);
    for (const [name, final] of Object.entries(AUGUST_FINALS) as [MemberName, string][]) {
      expect(openings.get(august.idOf(name))?.openingBalance, name).toBe(final);
    }
  });

  it("refuses when someone left out of the next month still has a balance", async () => {
    const september = await startNext();
    const [sep] = await db
      .select()
      .from(billingPeriods)
      .where(and(eq(billingPeriods.year, september.year), eq(billingPeriods.month, september.month)));
    await db
      .delete(periodBalances)
      .where(and(eq(periodBalances.periodId, sep.id), eq(periodBalances.memberId, august.idOf("Dan"))));
    await expectRefused(/Dan isn't in September 2026 but still has an unsettled balance/);
  });
});
