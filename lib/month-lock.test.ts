import { describe, expect, it } from "vitest";
import { closeCheck, reopenCheck, vanishingBalances } from "@/lib/month-lock";

const july = { year: 2026, month: 7, status: "closed" as const };
const august = { year: 2026, month: 8, status: "open" as const };
const september = { year: 2026, month: 9, status: "open" as const };

describe("closeCheck", () => {
  it("allows the first month, or one whose previous month is closed", () => {
    expect(closeCheck(august, null, null)).toEqual({ ok: true });
    expect(closeCheck(august, july, null)).toEqual({ ok: true });
  });

  it("closes oldest-first", () => {
    expect(closeCheck(september, august, null)).toEqual({ ok: false, reason: "Close August 2026 first." });
  });

  it("refuses while an emailed bill is still pending", () => {
    expect(closeCheck(august, null, null, ["Meralco", "Water"])).toEqual({
      ok: false,
      reason: "Confirm or discard the pending Meralco, Water bills first (Split Table).",
    });
  });

  it("refuses when the numbers can't be calculated, or it's already closed", () => {
    expect(closeCheck(august, null, "Shares for Water add up to ₱1.00").ok).toBe(false);
    expect(closeCheck({ ...august, status: "closed" }, null, null).ok).toBe(false);
  });
});

describe("reopenCheck", () => {
  it("allows the latest closed month, or one whose next month is open", () => {
    expect(reopenCheck(july, null)).toEqual({ ok: true });
    expect(reopenCheck(july, august)).toEqual({ ok: true });
  });

  it("reopens newest-first", () => {
    expect(reopenCheck(july, { ...august, status: "closed" })).toEqual({
      ok: false,
      reason: "Reopen August 2026 first.",
    });
  });

  it("refuses a month that's already open", () => {
    expect(reopenCheck(august, null).ok).toBe(false);
  });
});

describe("vanishingBalances", () => {
  const finals = new Map([
    [1, 50000],
    [2, 0],
    [3, -1200],
  ]);

  it("lists people with an unsettled Final who aren't in the next month", () => {
    expect(vanishingBalances(finals, new Set([1]))).toEqual([3]);
  });

  it("ignores settled people, and months with no next month yet", () => {
    expect(vanishingBalances(finals, new Set([1, 3]))).toEqual([]);
    expect(vanishingBalances(finals, null)).toEqual([]);
  });
});
