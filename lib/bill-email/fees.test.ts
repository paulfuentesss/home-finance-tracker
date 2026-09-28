import { describe, expect, it } from "vitest";
import { paymentFee } from "@/lib/bill-email/fees";

describe("paymentFee", () => {
  it("matches how the August 2026 bills were paid (the sheet's amounts)", () => {
    // Meralco ₱15,448.59 + ₱15.00 = ₱15,463.59; Water ₱2,166.63 + ₱7.00 = ₱2,173.63.
    expect(paymentFee("meralco")).toEqual({ fee: 1500, note: "Bayad app convenience fee" });
    expect(paymentFee("water")).toEqual({ fee: 700, note: "Dragonpay fee (Manila Water QR)" });
  });

  it("has no note when there's no fee", () => {
    expect(paymentFee("pldt")).toEqual({ fee: 0, note: null });
  });
});
