// "Paid from the cash drawer" on a Helper entry or an advance (docs/features/cash-drawer.md),
// through the real Server Actions against a real Postgres (PGlite: docs/testing.md → Database
// tests), with the made-up August 2026. Logins, page refreshes and redirects are stubbed.

import { asc, eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { advances, helperEntries } from "@/db/schema";
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

const { addAdvance, addHelperEntry, updateAdvance, updateHelperEntry } = await import(
  "@/app/periods/[year]/[month]/actions"
);
const { computePeriod, getPeriodView } = await import("@/lib/periods");
const { pg, db } = await testDatabase();
let august: LoadedAugust;

// Mid-August in Manila, so the month is still open to housemates too.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-15T04:00:00Z"));
});
afterAll(() => vi.useRealTimers());

beforeEach(async () => {
  await resetDb(pg);
  august = await db.transaction((tx) => loadAugust(tx));
  signInAs("PA");
});

function signInAs(name: "PA" | "Ben") {
  auth.viewer = { memberId: august.idOf(name), name, role: name === "PA" ? "admin" : "member", email: null };
}
const form = (fields: Record<string, string | number | undefined>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) data.set(key, String(value));
  return data;
};

const lastHelper = async () =>
  (await db.select().from(helperEntries).orderBy(asc(helperEntries.id))).at(-1)!;
const lastAdvance = async () => (await db.select().from(advances).orderBy(asc(advances.id))).at(-1)!;

const visit = (fields: Record<string, string | number | undefined>) =>
  form({ periodId: august.periodId, kind: "visit", amount: "600.00", onDate: "2026-08-10", ...fields });
const advance = (fields: Record<string, string | number | undefined>) =>
  form({ periodId: august.periodId, category: "grocery", description: "Rice", amount: "250.00", spentOn: "2026-08-10", ...fields });

describe("a Helper entry paid from the drawer", () => {
  it("is flagged when the admin ticks it on his own payment, and unflagged when he unticks it", async () => {
    const pa = august.idOf("PA");
    expect(await addHelperEntry(null, visit({ payerId: pa, fromDrawer: "on" }))).toEqual({ ok: true });
    const entry = await lastHelper();
    expect(entry.fromDrawer).toBe(true);

    expect(await updateHelperEntry(null, form({ entryId: entry.id, payerId: pa, amount: "600.00", onDate: "2026-08-10" }))).toEqual({
      ok: true,
    });
    expect((await lastHelper()).fromDrawer).toBe(false);
  });

  it("refuses the box on someone else's payment, or with no date, saving nothing", async () => {
    const before = (await db.select().from(helperEntries)).length;
    expect(await addHelperEntry(null, visit({ payerId: august.idOf("Ben"), fromDrawer: "on" }))).toEqual({
      ok: false,
      error: "Only what you paid yourself can come from the cash drawer.",
    });
    expect(await addHelperEntry(null, visit({ payerId: august.idOf("PA"), onDate: "", fromDrawer: "on" }))).toEqual({
      ok: false,
      error: "Choose a date for anything paid from the cash drawer.",
    });
    expect(await db.select().from(helperEntries)).toHaveLength(before);
  });

  it("is never set by a housemate, whatever the form sends", async () => {
    signInAs("Ben");
    expect(await addHelperEntry(null, visit({ payerId: august.idOf("Ben"), fromDrawer: "on" }))).toEqual({ ok: true });
    expect((await lastHelper()).fromDrawer).toBe(false);
  });

  it("works on early pay too", async () => {
    const early = form({ periodId: august.periodId, kind: "early_pay", amount: "200.00", onDate: "2026-08-10" });
    early.set("payerId", String(august.idOf("PA")));
    early.set("fromDrawer", "on");
    expect(await addHelperEntry(null, early)).toEqual({ ok: true });
    expect(await lastHelper()).toMatchObject({ kind: "early_pay", fromDrawer: true });
  });

  it("is left alone by a housemate's edit", async () => {
    signInAs("Ben");
    expect(await addHelperEntry(null, visit({ payerId: august.idOf("Ben") }))).toEqual({ ok: true });
    const entry = await lastHelper();
    // As if flagged (the actions only let PA flag his own): Ben's own save must not touch it.
    await db.update(helperEntries).set({ fromDrawer: true }).where(eq(helperEntries.id, entry.id));
    const edit = form({ entryId: entry.id, payerId: august.idOf("Ben"), amount: "650.00", onDate: "2026-08-10" });
    expect(await updateHelperEntry(null, edit)).toEqual({ ok: true });
    expect(await lastHelper()).toMatchObject({ amount: "650.00", fromDrawer: true });
  });

  it("still saves a plain visit as before", async () => {
    expect(await addHelperEntry(null, visit({ payerId: august.idOf("Ben") }))).toEqual({ ok: true });
    expect(await lastHelper()).toMatchObject({ payerId: august.idOf("Ben"), amount: "600.00", fromDrawer: false });
  });
});

describe("an advance paid from the drawer", () => {
  it("is flagged when the admin ticks it on his own payment, and unflagged when he unticks it", async () => {
    const pa = august.idOf("PA");
    expect(await addAdvance(null, advance({ payerId: pa, fromDrawer: "on" }))).toEqual({ ok: true });
    const saved = await lastAdvance();
    expect(saved.fromDrawer).toBe(true);

    const edit = form({ advanceId: saved.id, payerId: pa, category: "grocery", description: "Rice", amount: "250.00", spentOn: "2026-08-10" });
    expect(await updateAdvance(null, edit)).toEqual({ ok: true });
    expect((await lastAdvance()).fromDrawer).toBe(false);
  });

  it("refuses the box on someone else's payment, or with no date", async () => {
    expect(await addAdvance(null, advance({ payerId: august.idOf("Ben"), fromDrawer: "on" }))).toEqual({
      ok: false,
      error: "Only what you paid yourself can come from the cash drawer.",
    });
    expect(await addAdvance(null, advance({ payerId: august.idOf("PA"), spentOn: "", fromDrawer: "on" }))).toEqual({
      ok: false,
      error: "Choose a date for anything paid from the cash drawer.",
    });
  });

  it("is never set by a housemate, and a housemate's edit leaves it as it was", async () => {
    signInAs("Ben");
    expect(await addAdvance(null, advance({ payerId: august.idOf("Ben"), fromDrawer: "on" }))).toEqual({ ok: true });
    const saved = await lastAdvance();
    expect(saved.fromDrawer).toBe(false);
    // As if PA had flagged it (the database allows it; the actions only let PA flag his own):
    // Ben's own save must not touch it.
    await db.update(advances).set({ fromDrawer: true }).where(eq(advances.id, saved.id));
    const edit = form({ advanceId: saved.id, payerId: august.idOf("Ben"), category: "food", description: "Rice", amount: "250.00", spentOn: "2026-08-10" });
    expect(await updateAdvance(null, edit)).toEqual({ ok: true });
    expect(await lastAdvance()).toMatchObject({ category: "food", fromDrawer: true });
  });
});

describe("the flag elsewhere", () => {
  async function flagPaEntries() {
    const pa = august.idOf("PA");
    await addAdvance(null, advance({ payerId: pa, fromDrawer: "on" }));
    await addHelperEntry(null, visit({ payerId: pa, fromDrawer: "on" }));
  }

  it("changes nothing in the split: the same Finals and Helper bill, flagged or not", async () => {
    const pa = august.idOf("PA");
    await addAdvance(null, advance({ payerId: pa }));
    await addHelperEntry(null, visit({ payerId: pa }));
    const before = (await computePeriod(db, 2026, 8))!;
    // Every dated advance (a flagged one needs a date) and PA's Helper visit.
    await db.update(advances).set({ fromDrawer: true }).where(isNotNull(advances.spentOn));
    await db.update(helperEntries).set({ fromDrawer: true }).where(eq(helperEntries.payerId, pa));
    expect((await db.select().from(advances).where(eq(advances.fromDrawer, true))).length).toBeGreaterThan(1);
    const after = (await computePeriod(db, 2026, 8))!;
    expect(after.result).toEqual(before.result);
    expect(before.result!.rows.length).toBeGreaterThan(0);
  });

  it("reaches the admin's month pages, never a housemate's", async () => {
    await flagPaEntries();
    const forPa = (await getPeriodView(2026, 8))!;
    expect(forPa.advances.filter((a) => a.fromDrawer)).toHaveLength(1);
    expect(forPa.helper.entries.filter((e) => e.fromDrawer)).toHaveLength(1);

    signInAs("Ben");
    const forBen = (await getPeriodView(2026, 8))!;
    expect(forBen.advances.some((a) => a.fromDrawer)).toBe(false);
    expect(forBen.helper.entries.some((e) => e.fromDrawer)).toBe(false);
    // The same entries are there; only the flag is hidden.
    expect(forBen.advances).toHaveLength(forPa.advances.length);
  });
});
