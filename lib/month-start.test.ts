// Starting the next month (lib/month-start.ts) against a real Postgres (PGlite: docs/testing.md →
// Database tests), from the made-up August 2026. What's expected comes from the rules
// (docs/features/months.md, docs/settlement-rules.md → "Months and carry-over").

import { and, count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  billingPeriods,
  billItems,
  billItemShares,
  members,
  payments,
  periodBalances,
  sharedColumnMembers,
} from "@/db/schema";
import { AUGUST_2026, MERALCO_POINTS, type MemberName } from "@/lib/__fixtures__/august-2026";
import { loadAugust, type LoadedAugust } from "@/lib/__fixtures__/load-august";
import { closeMonthIn } from "@/lib/month-close";
import { DEFAULT_COLUMN_NAME, startNextMonthIn } from "@/lib/month-start";
import { toCentavos } from "@/lib/money";
import { resetDb, testDatabase } from "./test-db";

vi.mock("server-only", () => ({}));
vi.mock("@/db", async () => (await import("./test-db")).dbModule());
vi.mock("@/lib/auth", () => ({}));

const { pg, db } = await testDatabase();
let august: LoadedAugust;

beforeEach(async () => {
  await resetDb(pg);
  august = await db.transaction((tx) => loadAugust(tx));
});

const start = (options?: { dryRun?: boolean }) => db.transaction((tx) => startNextMonthIn(tx, options));
const closeAugust = () => db.transaction((tx) => closeMonthIn(tx, august.periodId));

async function september() {
  return db.query.billingPeriods.findFirst({
    where: and(eq(billingPeriods.year, 2026), eq(billingPeriods.month, 9)),
    with: {
      balances: true,
      billItems: { with: { shares: true }, orderBy: (b, { asc }) => [asc(b.id)] },
      sharedColumns: { with: { members: true } },
    },
  });
}

const rowCount = async (table: typeof billingPeriods | typeof billItems | typeof periodBalances | typeof billItemShares) =>
  (await db.select({ n: count() }).from(table))[0].n;

describe("starting the next month", () => {
  it("starts September with the bill columns at ₱0 and only Advances Shared", async () => {
    expect(await start()).toEqual({ year: 2026, month: 9 });
    const sep = (await september())!;
    expect(sep.status).toBe("open");

    // Every bill column is copied (name, kind, split mode, payer) with a ₱0 total and ₱0 shares.
    expect(sep.billItems.map((b) => b.name)).toEqual(AUGUST_2026.bills.map((b) => b.name));
    for (const bill of sep.billItems) {
      const from = AUGUST_2026.bills.find((b) => b.name === bill.name)!;
      expect(toCentavos(bill.totalAmount), bill.name).toBe(0);
      expect(bill.splitMode, bill.name).toBe(from.splitMode);
      expect(bill.kind, bill.name).toBe(bill.name === "Helper" ? "helper" : "standard");
      expect(bill.paidById, bill.name).toBe(august.idOf(from.paidBy));
      expect(bill.status, bill.name).toBe("confirmed");
      expect(bill.shares.map((s) => toCentavos(s.amount)), bill.name).toEqual(bill.shares.map(() => 0));
    }
    // Meralco keeps everyone's points.
    const meralco = sep.billItems.find((b) => b.name === "Meralco")!;
    for (const [name, points] of Object.entries(MERALCO_POINTS) as [MemberName, number][]) {
      expect(Number(meralco.shares.find((s) => s.memberId === august.idOf(name))?.points), name).toBe(points);
    }

    // Only the everyday column carries over (not "w/o PA" or the Ice Maker), shared by everyone.
    expect(sep.sharedColumns.map((c) => c.name)).toEqual([DEFAULT_COLUMN_NAME]);
    const [column] = sep.sharedColumns;
    expect(column.isDefault).toBe(true);
    expect(column.splitMode).toBe("equal");
    expect(column.members.map((m) => m.memberId).sort()).toEqual(sep.balances.map((b) => b.memberId).sort());
  });

  it("opens on ₱0 after an open month (carry-over is live) and on the closing balances after a closed one", async () => {
    await start();
    const live = (await september())!.balances;
    expect(live.map((b) => toCentavos(b.openingBalance))).toEqual(live.map(() => 0));

    await resetDb(pg);
    august = await db.transaction((tx) => loadAugust(tx));
    await closeAugust();
    const closing = await db.select().from(periodBalances).where(eq(periodBalances.periodId, august.periodId));
    await start();
    const openings = new Map((await september())!.balances.map((b) => [b.memberId, toCentavos(b.openingBalance)]));
    expect(openings.size).toBe(closing.length);
    for (const b of closing) expect(openings.get(b.memberId), String(b.memberId)).toBe(toCentavos(b.closingBalance!));
  });

  it("gives every member 1 point when the last month's points were all 0", async () => {
    const [meralco] = await db.select().from(billItems).where(eq(billItems.name, "Meralco"));
    await db.update(billItemShares).set({ points: "0" }).where(eq(billItemShares.billItemId, meralco.id));
    await start();
    const copy = (await september())!.billItems.find((b) => b.name === "Meralco")!;
    expect(copy.shares.map((s) => Number(s.points))).toEqual(copy.shares.map(() => 1));
  });

  it("leaves out a view-only login", async () => {
    const [viewer] = await db
      .insert(members)
      .values({ name: "Viewer", sortOrder: 9, isCollector: false, role: "view_only" })
      .returning();
    await start();
    const sep = (await september())!;
    expect(sep.balances.map((b) => b.memberId)).not.toContain(viewer.id);
    expect(sep.billItems[0].shares.map((s) => s.memberId)).not.toContain(viewer.id);
    const inColumn = await db.select().from(sharedColumnMembers).where(eq(sharedColumnMembers.memberId, viewer.id));
    expect(inColumn).toEqual([]);
  });

  it("refuses while a housemate's \"I paid\" is waiting", async () => {
    await db.insert(payments).values({
      periodId: august.periodId,
      fromMemberId: august.idOf("Ben"),
      toMemberId: null,
      amount: "1000.00",
      paidOn: "2026-08-31",
      status: "pending",
    });
    await expect(start()).rejects.toThrow(/Confirm or reject the waiting payment first/);
    expect(await september()).toBeUndefined();
  });

  it("refuses when someone who moved out still has a balance", async () => {
    await db.update(members).set({ active: false }).where(eq(members.id, august.idOf("Dan")));
    await expect(start()).rejects.toThrow("Dan moved out but still has an unsettled balance in August 2026.");
    expect(await september()).toBeUndefined();
  });

  it("a dry run checks everything and writes nothing", async () => {
    const before = await Promise.all([billingPeriods, billItems, periodBalances, billItemShares].map(rowCount));
    expect(await start({ dryRun: true })).toEqual({ year: 2026, month: 9 });
    expect(await Promise.all([billingPeriods, billItems, periodBalances, billItemShares].map(rowCount))).toEqual(before);
  });
});
