import { describe, expect, it } from "vitest";
import {
  closeCheck,
  monthAfter,
  monthHasEnded,
  payablesCheck,
  reopenCheck,
  startCheck,
  vanishingBalances,
} from "@/lib/month-lock";

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

  it("refuses while a housemate's payment waits for PA", () => {
    expect(closeCheck(august, null, null, [], ["Ben ₱1,000.00"])).toEqual({
      ok: false,
      reason: "Confirm or reject the waiting payment first (Settle Up): Ben ₱1,000.00.",
    });
    expect(closeCheck(august, null, null, [], ["Ben ₱1,000.00", "Cara ₱500.00"]).reason).toBe(
      "Confirm or reject the waiting payments first (Settle Up): Ben ₱1,000.00, Cara ₱500.00.",
    );
  });

  it("refuses when the numbers can't be calculated, or it's already closed", () => {
    expect(closeCheck(august, null, "Shares for Water add up to ₱1.00").ok).toBe(false);
    expect(closeCheck({ ...august, status: "closed" }, null, null).ok).toBe(false);
  });
});

describe("startCheck", () => {
  it("starts the next month when nothing waits", () => {
    expect(startCheck([])).toEqual({ ok: true });
  });

  it("waits for a housemate's waiting payment, which next month wouldn't show", () => {
    expect(startCheck(["Ben ₱1,000.00"])).toEqual({
      ok: false,
      reason: "Confirm or reject the waiting payment first (Settle Up): Ben ₱1,000.00.",
    });
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

describe("monthHasEnded", () => {
  it("is false through the month's last day and true from the next day", () => {
    expect(monthHasEnded(2026, 10, "2026-10-31")).toBe(false);
    expect(monthHasEnded(2026, 10, "2026-11-01")).toBe(true);
    expect(monthHasEnded(2026, 10, "2026-10-01")).toBe(false);
  });

  it("handles the year's end and months long past", () => {
    expect(monthHasEnded(2026, 12, "2026-12-31")).toBe(false);
    expect(monthHasEnded(2026, 12, "2027-01-01")).toBe(true);
    expect(monthHasEnded(2026, 9, "2027-03-15")).toBe(true);
    expect(monthHasEnded(2026, 11, "2026-10-20")).toBe(false);
  });
});

describe("monthAfter", () => {
  it("rolls December into January", () => {
    expect(monthAfter(2026, 10)).toEqual({ year: 2026, month: 11 });
    expect(monthAfter(2026, 12)).toEqual({ year: 2027, month: 1 });
  });
});

describe("payablesCheck", () => {
  it("allows the bill email once the numbers work out and no bill is pending", () => {
    expect(payablesCheck(null)).toEqual({ ok: true });
  });

  it("refuses while the numbers can't be worked out or a bill is pending, like closing", () => {
    expect(payablesCheck("Shares don't add up").reason).toBe(
      "Fix the problem above first; the numbers can't be calculated yet.",
    );
    expect(payablesCheck(null, ["Meralco"])).toEqual({
      ok: false,
      reason: "Confirm or discard the pending Meralco bill first (Split Table).",
    });
  });
});
