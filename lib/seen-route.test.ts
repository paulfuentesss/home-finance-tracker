// /api/seen marking bill emails seen (docs/features/reminders.md), against a real Postgres
// (PGlite). Only the caller's own bill and "bills are in" emails, only those sent before the page
// was drawn, and only the first look after each send.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { asc } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { billingPeriods, members, reminderSends } from "@/db/schema";
import { resetDb, testDatabase } from "./test-db";

const auth = vi.hoisted(() => ({ memberId: null as number | null }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", async () => (await import("./test-db")).dbModule());
vi.mock("@/lib/auth", () => ({
  getViewer: async () => (auth.memberId === null ? null : { memberId: auth.memberId, role: "member" }),
}));

const { POST } = await import("@/app/api/seen/route");
const { pg, db } = await testDatabase();

const at = (iso: string) => new Date(iso);
const seen = (body: object) =>
  POST(new Request("http://localhost/api/seen", { method: "POST", body: JSON.stringify(body) }) as NextRequest);
const page = (drawnAt?: string) => ({ via: "web", platform: "mac", drawnAt: drawnAt && Date.parse(drawnAt) });
const seenAts = async () =>
  (await db.select({ id: reminderSends.id, seenAt: reminderSends.seenAt }).from(reminderSends).orderBy(asc(reminderSends.id))).map(
    (r) => r.seenAt,
  );

let ben: number;
let dan: number;

beforeEach(async () => {
  await resetDb(pg);
  [{ id: ben }, { id: dan }] = await db
    .insert(members)
    .values([
      { name: "Ben", sortOrder: 1 },
      { name: "Dan", sortOrder: 2 },
    ])
    .returning({ id: members.id });
  const [{ id: period }] = await db.insert(billingPeriods).values({ year: 2026, month: 8 }).returning({ id: billingPeriods.id });
  await db.insert(reminderSends).values([
    { periodId: period, kind: "payables", memberId: ben, sentAt: at("2026-09-01T01:00:00Z") }, // 1
    { periodId: period, kind: "unpaid", memberId: ben, sentAt: at("2026-09-01T01:00:00Z") }, // 2: not a bill
    { periodId: period, kind: "payables", memberId: dan, sentAt: at("2026-09-01T01:00:00Z") }, // 3: someone else's
    { periodId: period, kind: "bills_in", memberId: ben, sentAt: at("2026-09-03T01:00:00Z") }, // 4: after the page
  ]);
  auth.memberId = ben;
});

describe("POST /api/seen marks bill emails seen", () => {
  it("only the caller's own, sent before the page was drawn", async () => {
    expect((await seen(page("2026-09-02T00:00:00Z"))).status).toBe(204);
    const [bill, unpaid, dans, later] = await seenAts();
    expect(bill).toBeInstanceOf(Date);
    expect([unpaid, dans, later]).toEqual([null, null, null]);
  });

  it("does nothing without drawnAt (the every-page ping)", async () => {
    await seen(page());
    expect(await seenAts()).toEqual([null, null, null, null]);
  });

  it("keeps the first look, and marks again after a resend", async () => {
    await db.update(reminderSends).set({ seenAt: at("2026-09-01T05:00:00Z") });
    await seen(page("2026-09-04T00:00:00Z"));
    // Already seen since its send: kept. Seen before its send (bills_in, as if resent): marked now.
    const [bill, , , later] = await seenAts();
    expect(bill).toEqual(at("2026-09-01T05:00:00Z"));
    expect(later!.getTime()).toBeGreaterThan(at("2026-09-03T01:00:00Z").getTime());
  });

  it("refuses without a login", async () => {
    auth.memberId = null;
    expect((await seen(page("2026-09-02T00:00:00Z"))).status).toBe(401);
    expect(await seenAts()).toEqual([null, null, null, null]);
  });
});
