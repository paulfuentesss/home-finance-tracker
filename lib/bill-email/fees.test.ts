import { describe, expect, it } from "vitest";
import { columnPaymentFee, paymentFee } from "@/lib/bill-email/fees";

describe("paymentFee", () => {
  it("turns the August 2026 sample emails into the fixture's bill amounts", () => {
    // Meralco ₱12,492.54 + ₱15.00 = ₱12,507.54; Water ₱1,941.63 + ₱7.00 = ₱1,948.63.
    expect(paymentFee("meralco")).toEqual({ fee: 1500, note: "Bayad app convenience fee" });
    expect(paymentFee("water")).toEqual({ fee: 700, note: "Dragonpay fee (Manila Water QR)" });
  });

  it("has no note when there's no fee", () => {
    expect(paymentFee("pldt")).toEqual({ fee: 0, note: null });
  });
});

describe("columnPaymentFee", () => {
  it("gives the fee for the columns emailed bills fill, by column name", () => {
    expect(columnPaymentFee("Meralco")).toEqual({ fee: 1500, note: "Bayad app convenience fee" });
    expect(columnPaymentFee("Water")).toEqual({ fee: 700, note: "Dragonpay fee (Manila Water QR)" });
  });

  it("has nothing for a column without a fee, or one no email fills", () => {
    expect(columnPaymentFee("PLDT Wifi")).toBeNull();
    expect(columnPaymentFee("Helper")).toBeNull();
    // Names match exactly, as the email import matches them.
    expect(columnPaymentFee("meralco")).toBeNull();
  });
});
