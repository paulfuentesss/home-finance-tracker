// A bill's Date paid, which is what stops the admin's bills-to-pay banner and reminders
// (docs/features/reminders.md → Biller due dates): set with "Paid today" or on the Split Table,
// even once the month is closed — but nothing else in a closed month. Through the real Server
// Actions against a real Postgres (PGlite: docs/testing.md → Database tests), with the made-up
// August 2026. Logins, page refreshes and redirects are stubbed.

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { billingPeriods, billItems, periodBalances } from "@/db/schema";
import { loadAugust, type LoadedAugust } from "@/lib/__fixtures__/load-august";
import type { Viewer } from "@/lib/permissions";
import { resetDb, testDatabase } from "./test-db";

const auth = vi.hoisted(() => ({ viewer: null as Viewer | null }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", async () => (await import("./test-db")).dbModule());
vi.mock("@/lib/auth", () => ({
  getViewer: async () => auth.viewer,
  previewFor: async () => null,
  requireViewer: async () => auth.viewer,
  getPreview: async () => null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect to ${to}`);
  },
}));
vi.mock("next/server", () => ({ after: () => {} }));

const { markBillPaid, updateBillDates } = await import("@/app/periods/[year]/[month]/actions");
const { pg, db } = await testDatabase();
let august: LoadedAugust;
let meralcoId: number;

// Sept. 10 in Manila: August's bills fell due last week.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-10T04:00:00Z"));
});
afterAll(() => vi.useRealTimers());

beforeEach(async () => {
  await resetDb(pg);
  august = await db.transaction((tx) => loadAugust(tx));
  signInAs("PA");
  const meralco = and(eq(billItems.periodId, august.periodId), eq(billItems.name, "Meralco"));
  const [row] = await db.update(billItems).set({ paidOn: null }).where(meralco).returning({ id: billItems.id });
  meralcoId = row.id;
});

function signInAs(name: "PA" | "Ben") {
  auth.viewer = { memberId: august.idOf(name), name, role: name === "PA" ? "admin" : "member", email: null };
}
const form = (fields: Record<string, string | number>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, String(value));
  return data;
};
const meralco = async () => (await db.select().from(billItems).where(eq(billItems.id, meralcoId)))[0];
const closeAugust = () => db.update(billingPeriods).set({ status: "closed" }).where(eq(billingPeriods.id, august.periodId));

describe("Paid today", () => {
  it("sets the bill's Date paid to today in Manila", async () => {
    expect(await markBillPaid(meralcoId)).toEqual({ ok: true, redirectTo: undefined });
    expect((await meralco()).paidOn).toBe("2026-09-10");
  });

  it("works on a closed month", async () => {
    await closeAugust();
    expect((await markBillPaid(meralcoId))?.ok).toBe(true);
    expect((await meralco()).paidOn).toBe("2026-09-10");
  });

  it("is the admin's only", async () => {
    signInAs("Ben");
    expect(await markBillPaid(meralcoId)).toEqual({ ok: false, error: "Only the admin can change this." });
    expect((await meralco()).paidOn).toBeNull();
  });
});

describe("a closed month's dates on the Split Table", () => {
  it("Date paid can still be set and cleared, changing no number", async () => {
    await closeAugust();
    // Saved Finals, as closing would have stored them: they must not move.
    await db
      .update(periodBalances)
      .set({ closingBalance: sql`${periodBalances.openingBalance} + ${periodBalances.memberId}` })
      .where(eq(periodBalances.periodId, august.periodId));
    const balances = () => db.select().from(periodBalances).where(eq(periodBalances.periodId, august.periodId));
    const before = await balances();

    const set = await updateBillDates(null, form({ billId: meralcoId, field: "paidOn", value: "2026-09-08" }));
    expect(set?.ok).toBe(true);
    expect((await meralco()).paidOn).toBe("2026-09-08");
    const cleared = await updateBillDates(null, form({ billId: meralcoId, field: "paidOn", value: "" }));
    expect(cleared?.ok).toBe(true);
    expect((await meralco()).paidOn).toBeNull();
    expect((await markBillPaid(meralcoId))?.ok).toBe(true);

    expect(await balances()).toEqual(before);
    const { totalAmount, status } = await meralco();
    expect({ totalAmount, status }).toEqual({ totalAmount: "12507.54", status: "confirmed" });
  });

  it("the Due date can't", async () => {
    await closeAugust();
    const result = await updateBillDates(null, form({ billId: meralcoId, field: "dueDate", value: "2026-09-20" }));
    expect(result).toEqual({ ok: false, error: "This month is closed, so it can't be changed." });
    expect((await meralco()).dueDate).toBe("2026-09-06");
  });
});
