import { describe, expect, it } from "vitest";
import { reminderKind } from "../db/schema";
import {
  billArrivedPush,
  billEmailStuckPush,
  billReadyPush,
  monthEndPush,
  paymentDecidedPush,
  paymentSentPush,
  PUSHES,
  readyPush,
  startBlockedPush,
  testPush,
  unpaidPush,
  type Push,
} from "./push-messages";
import type { Centavos } from "./money";

const c = (n: number) => n as Centavos;
const OCT = { year: 2026, month: 10 };
const SETTLE = "/periods/2026/11/settle";

describe("which reminders push", () => {
  it("covers every reminder kind in the database", () => {
    expect(Object.keys(PUSHES).sort()).toEqual([...reminderKind.enumValues].sort());
  });

  it("only when something is due soon: the early month-end reminders and the view-only note stay email-only", () => {
    const emailOnly = Object.entries(PUSHES)
      .filter(([, pushes]) => !pushes)
      .map(([kind]) => kind)
      .sort();
    expect(emailOnly).toEqual(["bills_in", "three_days", "week"]);
  });

  it("month-end: only the last day", () => {
    expect(monthEndPush("week", OCT)).toBeNull();
    expect(monthEndPush("three_days", OCT)).toBeNull();
    expect(monthEndPush("last_day", OCT)).toEqual({
      title: "⏰ Last day to log your October expenses",
      body: "Add anything you paid for the house this month before it locks tonight.",
      url: "/periods/2026/10/advances",
      tag: "month-end-2026-10",
    });
  });
});

describe("the bill", () => {
  it("owes: ready, linking where I paid goes", () => {
    const push = billReadyPush({ ...OCT, payables: { kind: "owes", due: c(150000), waiting: c(0), left: c(150000) }, path: SETTLE });
    expect(push).toEqual({
      title: "🧾 Your October bill is ready",
      body: "Tap to see your share and pay in Settle Up.",
      url: SETTLE,
      tag: "bill-2026-10",
    });
  });

  it("owed: money back, no amount", () => {
    const push = billReadyPush({ ...OCT, payables: { kind: "owed", amount: c(50000) }, path: SETTLE });
    expect(push?.title).toBe("💰 Good news! You get money back for October");
  });

  it("nothing to tell (like the email): settled, or everything already sent", () => {
    expect(billReadyPush({ ...OCT, payables: { kind: "settled" }, path: SETTLE })).toBeNull();
    const sent = { kind: "owes" as const, due: c(100), waiting: c(100), left: c(0) };
    expect(billReadyPush({ ...OCT, payables: sent, path: SETTLE })).toBeNull();
  });

  it("still unpaid replaces the bill push on the phone (same tag)", () => {
    const unpaid = unpaidPush({ ...OCT, path: SETTLE });
    expect(unpaid.tag).toBe("bill-2026-10");
    expect(unpaid.url).toBe(SETTLE);
  });
});

describe("payments", () => {
  it("confirmed and rejected go to the housemate; the reason stays in the app", () => {
    const confirmed = paymentDecidedPush({ status: "confirmed", ...OCT, collectorName: "PA" });
    expect(confirmed.title).toBe("✅ PA confirmed your October payment");
    const rejected = paymentDecidedPush({ status: "rejected", ...OCT, collectorName: "PA" });
    expect(rejected).toEqual({
      title: "Your October payment needs a look",
      body: "PA couldn't confirm it. Tap to see why.",
      url: "/periods/2026/10/settle",
      tag: "payment-2026-10",
    });
  });

  it("I paid goes to the admin", () => {
    expect(paymentSentPush({ name: "Ben", ...OCT })).toEqual({
      title: "💸 Ben sent a payment",
      body: "Check the House Budget, then confirm it in October's Settle Up.",
      url: "/periods/2026/10/settle",
      tag: "paid-Ben-2026-10",
    });
  });
});

describe("the admin's", () => {
  it("bill emails", () => {
    expect(billArrivedPush({ bill: "Meralco", ...OCT })).toMatchObject({
      title: "⚡ Meralco's October bill is in",
      url: "/periods/2026/10",
    });
    expect(billEmailStuckPush({ path: "/periods/2026/10/manage" }).url).toBe("/periods/2026/10/manage");
  });

  it("couldn't start: names the next month, across the year", () => {
    expect(startBlockedPush({ year: 2026, month: 12 })).toMatchObject({ title: "Couldn't start January", tag: "start-2027-1" });
  });

  it("nudges", () => {
    expect(readyPush({ kind: "email_bill", ...OCT }).body).toBe("Ready to email everyone their bill.");
    expect(readyPush({ kind: "close", ...OCT }).title).toBe("Everyone has paid for October");
  });
});

it("a test push says who it was for", () => {
  expect(testPush(unpaidPush({ ...OCT, path: SETTLE }), "Ben").title).toMatch(/^\[test → Ben\] /);
});

it("no push shows an amount or links outside the app (the lock screen is public)", () => {
  const all: (Push | null)[] = [
    monthEndPush("last_day", OCT),
    billReadyPush({ ...OCT, payables: { kind: "owes", due: c(123456), waiting: c(0), left: c(123456) }, path: SETTLE }),
    billReadyPush({ ...OCT, payables: { kind: "owed", amount: c(123456) }, path: SETTLE }),
    unpaidPush({ ...OCT, path: SETTLE }),
    paymentDecidedPush({ status: "confirmed", ...OCT, collectorName: "PA" }),
    paymentDecidedPush({ status: "rejected", ...OCT, collectorName: "PA" }),
    paymentSentPush({ name: "Ben", ...OCT }),
    billArrivedPush({ bill: "Water", ...OCT }),
    billEmailStuckPush({ path: "/" }),
    startBlockedPush(OCT),
    readyPush({ kind: "email_bill", ...OCT }),
    readyPush({ kind: "close", ...OCT }),
  ];
  for (const push of all) {
    expect(push).not.toBeNull();
    expect(`${push!.title} ${push!.body}`).not.toMatch(/₱|\d[\d,]*\.\d\d|1,234/);
    expect(push!.url).toMatch(/^\/(?!\/)/);
  }
});
