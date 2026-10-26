import { describe, expect, it } from "vitest";
import {
  MERALCO_AUGUST_2026,
  PLDT_AUGUST_2026,
  WATER_AUGUST_2026,
} from "@/lib/bill-email/__fixtures__/august-2026-emails";
import { billMonth, field, parseBillEmail, parseDate, providerOf, type BillEmail } from "@/lib/bill-email/parse";

describe("parseBillEmail — the August 2026 sample emails", () => {
  it("reads Meralco", () => {
    expect(parseBillEmail(MERALCO_AUGUST_2026)).toEqual({
      ok: true,
      bill: {
        provider: "meralco",
        amount: 1_249_254,
        dueDate: "2026-09-06",
        periodStart: "2026-07-27",
        periodEnd: "2026-08-26",
        year: 2026,
        month: 8,
      },
    });
  });

  it("reads Manila Water", () => {
    expect(parseBillEmail(WATER_AUGUST_2026)).toEqual({
      ok: true,
      bill: {
        provider: "water",
        amount: 194_163,
        dueDate: "2026-09-03",
        periodStart: "2026-07-26",
        periodEnd: "2026-08-26",
        year: 2026,
        month: 8,
      },
    });
  });

  it("reads PLDT's Current Charges (no billing period in the email)", () => {
    expect(parseBillEmail(PLDT_AUGUST_2026)).toEqual({
      ok: true,
      bill: {
        provider: "pldt",
        amount: 189_900,
        dueDate: "2026-08-30",
        periodStart: null,
        periodEnd: null,
        year: 2026,
        month: 8,
      },
    });
  });

  it("puts every August bill in August, like the household sheet", () => {
    for (const email of [MERALCO_AUGUST_2026, WATER_AUGUST_2026, PLDT_AUGUST_2026]) {
      const result = parseBillEmail(email);
      expect(result.ok && [result.bill.year, result.bill.month]).toEqual([2026, 8]);
    }
  });
});

describe("parseBillEmail — Manila Water's bold layout (since October 2026)", () => {
  // Made-up values in the real layout: no table, every value in *bold*.
  const WATER_BOLD: BillEmail = {
    messageId: "<fixture-water-bold@example.test>",
    from: "Manila Water <etaxforms@manilawater.com>",
    subject: "Manila Water Invoice for the Month of October 2026",
    receivedAt: "2026-10-25T22:14:00Z",
    text: `*Dear Katubig,*

We are pleased to share your official *Manila Water Invoice for October 2026*.
Below is a summary of your monthly billing for your reference.

Billing Date: *25 Oct 2026*
Billing Period: *26 Sep 2026 to 25 Oct 2026*
Contract Account Number (CAN): *00000000*
Invoice Number: *XXX0000-0000000000*
Consumption (cu.m.): *40*
Total Amount Due: *PHP 1,234.56*
Due Date: *02 Nov 2026*

Please settle your account on or before the due date to avoid possible service disruptions.`,
  };
  const expected = {
    ok: true,
    bill: {
      provider: "water",
      amount: 123_456,
      dueDate: "2026-11-02",
      periodStart: "2026-09-26",
      periodEnd: "2026-10-25",
      year: 2026,
      month: 10,
    },
  };

  it("reads it", () => {
    expect(parseBillEmail(WATER_BOLD)).toEqual(expected);
  });

  it("reads it with every row on one line", () => {
    expect(parseBillEmail({ ...WATER_BOLD, text: WATER_BOLD.text.replace(/\s+/g, " ") })).toEqual(expected);
  });
});

describe("field", () => {
  it("reads plain, table and bold values", () => {
    expect(field("Current Amount Due: PHP 12.00\nDue Date: x", "Current Amount Due")).toBe("PHP 12.00");
    expect(field("| Total Amount Due: | PHP 12.00 |", "Total Amount Due")).toBe("PHP 12.00");
    expect(field("| Current Charges | : | 12.00 |", "Current Charges")).toBe("12.00");
    expect(field("Total Amount Due: *PHP 12.00* Due Date: *x*", "Total Amount Due")).toBe("PHP 12.00");
    expect(field("*Total Amount Due:* PHP 12.00", "Total Amount Due")).toBe("PHP 12.00");
  });
});

describe("parseBillEmail — what it refuses", () => {
  const email = (over: Partial<BillEmail>): BillEmail => ({ ...MERALCO_AUGUST_2026, ...over });

  it("refuses senders that aren't a bill provider, including lookalikes", () => {
    expect(parseBillEmail(email({ from: "alerts@maribank.com.ph" })).ok).toBe(false);
    expect(parseBillEmail(email({ from: "customercare@meralco.com.ph.evil.test" })).ok).toBe(false);
    expect(parseBillEmail(email({ from: "no-reply@cm.pldthome.com" })).ok).toBe(false);
  });

  it("refuses a provider email that isn't a bill (no amount line)", () => {
    const result = parseBillEmail(email({ subject: "Go paperless", text: "It's worth the switch, go Paperless today" }));
    expect(result).toEqual({ ok: false, provider: "meralco", reason: expect.stringContaining("Current Amount Due") });
  });

  it("refuses when it can't tell the month", () => {
    const result = parseBillEmail(
      email({ subject: "Your bill", text: "Current Amount Due: PHP 1,000.00\nDue Date: 06 September 2026" }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("providerOf", () => {
  it("matches the sender's domain and subdomains", () => {
    expect(providerOf("Meralco <customercare@meralco.com.ph>")).toBe("meralco");
    expect(providerOf("customercare@email.meralco.com.ph")).toBe("meralco");
    expect(providerOf("ETAXFORMS@MANILAWATER.COM")).toBe("water");
    expect(providerOf("pldthome@pldt.com.ph")).toBe("pldt");
    expect(providerOf("someone@notmeralco.com.ph")).toBeNull();
  });
});

describe("billMonth", () => {
  it("uses the month the email names", () => {
    expect(billMonth("Your eStatement for February 2026 is now available", null, null)).toEqual({ year: 2026, month: 2 });
    expect(billMonth("Invoice for the Month of December 2026", null, null)).toEqual({ year: 2026, month: 12 });
  });

  it("otherwise uses the middle of the billing period", () => {
    expect(billMonth("", "2026-07-27", "2026-08-26")).toEqual({ year: 2026, month: 8 });
    expect(billMonth("", "2026-12-20", "2027-01-19")).toEqual({ year: 2027, month: 1 });
    expect(billMonth("", "2026-12-01", "2026-12-31")).toEqual({ year: 2026, month: 12 });
  });

  it("gives up with neither", () => {
    expect(billMonth("", null, null)).toBeNull();
  });
});

describe("parseDate", () => {
  it("reads the providers' date styles", () => {
    expect(parseDate("06 September 2026")).toBe("2026-09-06");
    expect(parseDate("3 Sep 2026")).toBe("2026-09-03");
    expect(parseDate("August 30, 2026")).toBe("2026-08-30");
    expect(parseDate("January 06, 2026")).toBe("2026-01-06");
  });

  it("rejects dates that don't exist or aren't dates", () => {
    expect(parseDate("31 June 2026")).toBeNull();
    expect(parseDate("soon")).toBeNull();
  });
});
