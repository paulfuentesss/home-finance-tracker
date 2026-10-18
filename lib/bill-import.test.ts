// Bill emails into pending bills (lib/bill-import.ts) against a real Postgres (PGlite:
// docs/testing.md → Database tests), with the made-up August 2026 and its sample emails. Shares
// expected here are worked out by hand from docs/settlement-rules.md, never the app's output.

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { billEmails, billingPeriods, billItems, billItemShares } from "@/db/schema";
import type { MemberName } from "@/lib/__fixtures__/august-2026";
import { loadAugust, type LoadedAugust } from "@/lib/__fixtures__/load-august";
import { MERALCO_AUGUST_2026, WATER_AUGUST_2026 } from "@/lib/bill-email/__fixtures__/august-2026-emails";
import type { BillEmail } from "@/lib/bill-email/parse";
import { importBillEmail, placeBill } from "@/lib/bill-import";
import { resetDb, testDatabase } from "./test-db";

vi.mock("server-only", () => ({}));
vi.mock("@/db", async () => (await import("./test-db")).dbModule());

const { pg, db } = await testDatabase();
let august: LoadedAugust;

beforeEach(async () => {
  await resetDb(pg);
  august = await db.transaction((tx) => loadAugust(tx));
});

/** A bill column as it is before its bill comes in: ₱0. */
const emptyColumn = (name: string) => db.update(billItems).set({ totalAmount: "0" }).where(eq(billItems.name, name));

async function billNamed(name: string) {
  const [bill] = await db.select().from(billItems).where(eq(billItems.name, name));
  const shares = await db.select().from(billItemShares).where(eq(billItemShares.billItemId, bill.id));
  return { bill, share: (member: MemberName) => shares.find((s) => s.memberId === august.idOf(member))?.amount };
}

const inbox = () => db.select().from(billEmails);

describe("importing a bill email", () => {
  it("fills Meralco's ₱0 column as a pending bill, with the fee, split by points", async () => {
    await emptyColumn("Meralco");
    const outcome = await importBillEmail(db, MERALCO_AUGUST_2026);
    expect(outcome.kind).toBe("imported");

    const { bill, share } = await billNamed("Meralco");
    // The bill's ₱12,492.54 + Meralco's BILL_PAYMENT_FEES fee: the fixture's total (lib/bill-email/fees.test.ts).
    expect(bill.totalAmount).toBe("12507.54");
    expect(bill.status).toBe("pending");
    expect(bill.source).toBe("email");
    // By points (8.2 in all): the worked example's shares (lib/settlement.test.ts).
    expect((["Ana", "Ben", "Cara", "Dan", "PA"] as const).map(share)).toEqual([
      "3355.68",
      "2287.97",
      "2287.96",
      "1525.31",
      "3050.62",
    ]);

    const [email] = await inbox();
    expect(email).toMatchObject({ status: "imported", billItemId: bill.id, amount: "12492.54", fee: "15.00", reason: null });
    // A parsed bill keeps its details in the columns, never the body (it holds account numbers).
    expect(email.snippet).toBe("");
  });

  it("splits Water equally, the leftover centavos collector first", async () => {
    await emptyColumn("Water");
    expect((await importBillEmail(db, WATER_AUGUST_2026)).kind).toBe("imported");
    const { bill, share } = await billNamed("Water");
    // ₱1,941.63 + Water's fee = the fixture's ₱1,948.63 → ₱389.72 each and 3 centavos left: PA, then Ana, then Ben.
    expect(bill.totalAmount).toBe("1948.63");
    expect((["PA", "Ana", "Ben", "Cara", "Dan"] as const).map(share)).toEqual([
      "389.73",
      "389.73",
      "389.73",
      "389.72",
      "389.72",
    ]);
  });

  it("does nothing new with the same email twice, or a second email for the same bill", async () => {
    await emptyColumn("Meralco");
    await importBillEmail(db, MERALCO_AUGUST_2026);
    expect(await importBillEmail(db, MERALCO_AUGUST_2026)).toEqual({ kind: "duplicate" });
    // A reminder or a re-forward: another Message-ID, the same provider and month.
    const reminder = { ...MERALCO_AUGUST_2026, messageId: "<fixture-meralco-reminder@example.test>" };
    expect(await importBillEmail(db, reminder)).toEqual({ kind: "duplicate" });
    expect(await inbox()).toHaveLength(1);
    expect((await billNamed("Meralco")).bill.totalAmount).toBe("12507.54");
  });

  it("never overwrites an amount already there", async () => {
    // August's Meralco already has its ₱12,507.54 (typed by hand).
    await db.update(billItems).set({ totalAmount: "100.00" }).where(eq(billItems.name, "Meralco"));
    const outcome = await importBillEmail(db, MERALCO_AUGUST_2026);
    expect(outcome).toMatchObject({ kind: "unmatched", reason: expect.stringMatching(/Meralco in August 2026 already has ₱100\.00/) });
    const { bill } = await billNamed("Meralco");
    expect(bill).toMatchObject({ totalAmount: "100.00", status: "confirmed", source: "manual" });
    expect((await inbox())[0]).toMatchObject({ status: "unmatched", billItemId: null });
  });

  it.each([
    ["the month isn't started", () => resetDb(pg), /August 2026 hasn't been started yet/],
    [
      "the month is closed",
      async () => db.update(billingPeriods).set({ status: "closed", closedAt: new Date() }),
      /August 2026 is closed/,
    ],
    [
      "there's no Meralco column",
      async () => db.update(billItems).set({ name: "Electricity" }).where(eq(billItems.name, "Meralco")),
      /August 2026 has no "Meralco" column/,
    ],
    [
      "Meralco is split by hand",
      async () => db.update(billItems).set({ splitMode: "manual" }).where(eq(billItems.name, "Meralco")),
      /Meralco is split manually in August 2026/,
    ],
  ])("stays in the inbox with the reason when %s", async (_, arrange, reason) => {
    await emptyColumn("Meralco");
    await arrange();
    const outcome = await importBillEmail(db, MERALCO_AUGUST_2026);
    expect(outcome).toMatchObject({ kind: "unmatched", reason: expect.stringMatching(reason) });
    const [email] = await inbox();
    expect(email.status).toBe("unmatched");
    expect(email.reason).toMatch(reason);
  });

  it("imports on Retry once the problem is fixed", async () => {
    await emptyColumn("Meralco");
    await db.update(billItems).set({ name: "Electricity" }).where(eq(billItems.name, "Meralco"));
    expect((await importBillEmail(db, MERALCO_AUGUST_2026)).kind).toBe("unmatched");

    await db.update(billItems).set({ name: "Meralco" }).where(eq(billItems.name, "Electricity"));
    const [row] = await inbox();
    const outcome = await db.transaction((tx) => placeBill(tx, row));
    expect(outcome.kind).toBe("imported");
    expect((await billNamed("Meralco")).bill).toMatchObject({ totalAmount: "12507.54", status: "pending" });
    expect((await inbox())[0]).toMatchObject({ status: "imported", reason: null });
  });

  it("keeps an email it can't read in the inbox, with a snippet, touching no bill", async () => {
    const other: BillEmail = {
      messageId: "<not-a-bill@example.test>",
      from: "someone@example.com",
      subject: "Hello",
      receivedAt: "2026-08-20T01:00:00Z",
      text: "Not a bill,\n  just a note.",
    };
    const before = await db.select().from(billItems);
    const outcome = await importBillEmail(db, other);
    expect(outcome.kind).toBe("unmatched");
    const [email] = await inbox();
    expect(email).toMatchObject({ status: "unmatched", provider: null, amount: null, snippet: "Not a bill, just a note." });
    expect(await db.select().from(billItems)).toEqual(before);
  });
});
