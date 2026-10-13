import { describe, expect, it } from "vitest";
import { billsInEmail, monthEndEmail, payablesEmail, readyEmail, startBlockedEmail } from "@/lib/reminder-emails";

const link = "https://example.test/periods/2026/10/advances";

describe("monthEndEmail", () => {
  it("counts the days left, names the last day, and says what to do", () => {
    const email = monthEndEmail("week", { name: "Ben", year: 2026, month: 10, daysLeft: 7, link });
    expect(email.subject).toBe("7 days left to log your October expenses");
    expect(email.text).toContain("Hi Ben,");
    expect(email.text).toContain("7 days left in October.");
    expect(email.text).toContain("so it's counted when October's bills are split.");
    expect(email.text).toContain("October locks after the 31st. After that you can't add to it anymore.");
    expect(email.text).not.toContain("Oct. 31");
    expect(email.text).toContain("To do: log anything you paid for the house this month");
    expect(email.text).toContain(`Log it here: ${link}`);
    expect(email.text).toContain("Questions? Message the admin.");
  });

  it("says the real count when a missed reminder is caught up", () => {
    expect(monthEndEmail("week", { name: "Ben", year: 2026, month: 10, daysLeft: 5, link }).subject).toBe(
      "5 days left to log your October expenses",
    );
  });

  it("warns about the lock 3 days before, and on the last day", () => {
    expect(monthEndEmail("three_days", { name: "Cara", year: 2026, month: 10, daysLeft: 3, link }).subject).toBe(
      "October locks in 3 days: log your expenses",
    );
    const last = monthEndEmail("last_day", { name: "Cara", year: 2026, month: 10, daysLeft: 0, link });
    expect(last.subject).toBe("Today is the last day to log your October expenses");
    expect(last.text).toContain("Today is the last day of October.");
    expect(last.text).toContain("From tomorrow October is locked");
  });
});

describe("payablesEmail", () => {
  const base = { name: "Dan", year: 2026, month: 10, carriedOver: 0, collectorName: "PA", link };

  it("tells them what to pay and how, one amount per line", () => {
    const email = payablesEmail({ ...base, payables: { kind: "owes", due: 234_550, waiting: 0, left: 234_550 } })!;
    expect(email.subject).toBe("Your October bill is ready: ₱2,345.50");
    expect(email.text).toContain("October's bills are in and everyone's share is worked out.");
    expect(email.text).toContain("Your share: ₱2,345.50");
    expect(email.text).toContain('To do: send ₱2,345.50 to the House Budget, then open Settle Up, tap "I paid"');
    expect(email.text).not.toContain("waiting");
    expect(email.text).not.toContain("last month");
  });

  it("shows last month's carry-over and a waiting I paid", () => {
    const email = payablesEmail({
      ...base,
      carriedOver: 50_000,
      payables: { kind: "owes", due: 234_550, waiting: 100_000, left: 134_550 },
    })!;
    expect(email.subject).toBe("Your October bill is ready: ₱1,345.50");
    expect(email.text).toContain(
      "Your share: ₱2,345.50\n(includes ₱500.00 still unpaid from last month)\n" +
        "Already sent, waiting for PA to confirm: ₱1,000.00\nLeft to pay: ₱1,345.50",
    );
    expect(email.text).toContain("To do: send ₱1,345.50");
  });

  it("doesn't say 'includes' when all of it is from last month", () => {
    const email = payablesEmail({
      ...base,
      carriedOver: 987_650,
      payables: { kind: "owes", due: 987_650, waiting: 0, left: 987_650 },
    })!;
    expect(email.text).toContain("Your share: ₱9,876.50\n(still unpaid from last month)");
  });

  it("tells someone owed that they get money back", () => {
    const email = payablesEmail({ ...base, payables: { kind: "owed", amount: 12_000 } })!;
    expect(email.subject).toBe("October is worked out: you get ₱120.00 back");
    expect(email.text).toContain("You get back: ₱120.00");
    expect(email.text).toContain("PA sends it from the House Budget");
  });

  it("sends nothing to someone settled or with everything sent", () => {
    expect(payablesEmail({ ...base, payables: { kind: "settled" } })).toBeNull();
    expect(payablesEmail({ ...base, payables: { kind: "owes", due: 1_000, waiting: 1_000, left: 0 } })).toBeNull();
  });
});

describe("billsInEmail", () => {
  const monthLink = "https://example.test/periods/2026/10";

  it("tells a view-only login the bills are in, with a link and no amounts", () => {
    const email = billsInEmail({ name: "Lola Rosa", year: 2026, month: 10, link: monthLink });
    expect(email.subject).toBe("October's bills are in! 🏠");
    expect(email.text).toContain("Hi Lola Rosa! 👋");
    expect(email.text).toContain("October's bills are all in and everyone's share is worked out.");
    expect(email.text).toContain(`Nothing for you to do. Just here to let you know! If you're curious, come take a look:\n${monthLink}`);
    expect(email.text).toContain("Please always take care where you are ❤️");
    expect(email.text).toContain("Questions? Message the admin.");
    expect(email.text).not.toContain("₱");
  });

  it("names the month alone, even in January", () => {
    expect(billsInEmail({ name: "Lola Rosa", year: 2027, month: 1, link: monthLink }).subject).toBe(
      "January's bills are in! 🏠",
    );
  });
});

describe("startBlockedEmail", () => {
  const reason = "Confirm or reject the waiting payment first (Settle Up): Ben ₱1,000.00.";

  it("says the next month couldn't start, why, and that it retries", () => {
    const email = startBlockedEmail({ name: "PA", year: 2026, month: 10, reason, link });
    expect(email.subject).toBe("Couldn't start November");
    expect(email.text).toContain("October has ended, but November couldn't start by itself");
    expect(email.text).toContain(`Why: ${reason}`);
    expect(email.text).toContain("November then starts by itself tomorrow morning");
    // The admin's own email doesn't send him to "message the admin".
    expect(email.text).not.toContain("Message the admin");
  });

  it("names the year only across New Year", () => {
    expect(startBlockedEmail({ name: "PA", year: 2026, month: 12, reason, link }).subject).toBe(
      "Couldn't start January 2027",
    );
  });
});

describe("readyEmail", () => {
  it("nudges to email the bill", () => {
    const email = readyEmail({ name: "PA", kind: "email_bill", year: 2026, month: 10, link });
    expect(email.subject).toBe("October's bills are all in: ready to email everyone");
    expect(email.text).toContain(`press "Email October's bill"`);
  });

  it("nudges to close", () => {
    const email = readyEmail({ name: "PA", kind: "close", year: 2026, month: 10, link });
    expect(email.subject).toBe("Everyone has paid for October: ready to close");
    expect(email.text).toContain("To do: close October in Settle Up.");
  });
});
