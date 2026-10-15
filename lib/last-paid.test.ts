import { describe, expect, it } from "vitest";
import { lastPaidOf } from "./last-paid";
import type { PaymentStatus } from "./permissions";
import { HOUSE_BUDGET, type Party } from "./settlement";

const ANA = 1;
const BEN = 2;
const PA = 5;

const paid = (paidOn: string, fromMemberId: Party = ANA, status: PaymentStatus = "confirmed") => ({
  fromMemberId,
  status,
  paidOn,
});

describe("lastPaidOf", () => {
  it("is null with no payment on record", () => {
    expect(lastPaidOf([], ANA, "2026-10-15")).toBeNull();
  });

  it("ignores waiting and rejected payments, and other people's", () => {
    const payments = [paid("2026-10-01", ANA, "pending"), paid("2026-10-02", ANA, "rejected"), paid("2026-10-03", BEN)];
    expect(lastPaidOf(payments, ANA, "2026-10-15")).toBeNull();
  });

  it("counts a payment to the House Budget, or straight to someone", () => {
    expect(lastPaidOf([{ fromMemberId: ANA, status: "confirmed", paidOn: "2026-10-03" }], ANA, "2026-10-15")).toEqual({
      label: "Oct. 3",
      monthsAgo: 0,
    });
    // The House Budget paying Ana is money to her, not from her.
    expect(lastPaidOf([paid("2026-10-03", HOUSE_BUDGET)], ANA, "2026-10-15")).toBeNull();
    expect(lastPaidOf([paid("2026-09-10", PA)], PA, "2026-10-15")?.label).toBe("Sept. 10");
  });

  it("picks the latest, whatever order they come in", () => {
    const payments = [paid("2026-09-06"), paid("2026-08-12"), paid("2026-10-15", ANA, "pending")];
    expect(lastPaidOf(payments, ANA, "2026-10-15")).toEqual({ label: "Sept. 6", monthsAgo: 1 });
  });

  it("counts whole months, so a day ago isn't a month ago", () => {
    expect(lastPaidOf([paid("2026-08-12")], ANA, "2026-10-15")?.monthsAgo).toBe(2);
    expect(lastPaidOf([paid("2026-08-20")], ANA, "2026-10-15")?.monthsAgo).toBe(1);
    expect(lastPaidOf([paid("2026-09-30")], ANA, "2026-10-01")?.monthsAgo).toBe(0);
    expect(lastPaidOf([paid("2026-09-15")], ANA, "2026-10-15")?.monthsAgo).toBe(1);
  });

  it("adds the year when it isn't this year", () => {
    expect(lastPaidOf([paid("2025-12-12")], ANA, "2026-02-15")).toEqual({ label: "Dec. 12, 2025", monthsAgo: 2 });
  });

  it("is never below 0 months for a date after today", () => {
    expect(lastPaidOf([paid("2026-11-02")], ANA, "2026-10-15")).toEqual({ label: "Nov. 2", monthsAgo: 0 });
  });
});
