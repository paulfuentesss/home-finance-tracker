// The words of every email My House sends (docs/features/reminders.md). Pure, so the wording is
// tested; names and amounts come from the database when the email is sent. Plain text: they're
// short, and plain text reads the same in every mail app.
//
// Every email has the same shape: what's happening (one line), "To do:", the link, the sign-off.

import { monthLabel } from "@/lib/format";
import { HOUSE_BUDGET_LABEL } from "@/lib/household-config";
import { formatPHP, type Centavos } from "@/lib/money";
import { monthAfter } from "@/lib/month-lock";
import { lastDayName, type MonthEndReminder, type Payables } from "@/lib/reminders";

export interface Email {
  subject: string;
  text: string;
}

/** To housemates. */
const SIGN_OFF = "— My House\n(Sent automatically. Questions? Message the admin.)";
/** To the admin, who the housemates' sign-off sends them to. */
const ADMIN_SIGN_OFF = "— My House\n(Sent automatically.)";

/** "October" — with the year only when it differs from `relativeTo` ("January 2027"). */
function monthName(year: number, month: number, relativeTo = year): string {
  const label = monthLabel(year, month);
  return year === relativeTo ? label.split(" ")[0] : label;
}

/** Paragraphs, blank-line separated; `false` / null parts are left out. */
function paragraphs(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((p) => typeof p === "string").join("\n\n");
}

/** The 7-days, 3-days and last-day reminders to a housemate. */
export function monthEndEmail(
  kind: MonthEndReminder,
  { name, year, month, daysLeft, link }: { name: string; year: number; month: number; daysLeft: number; link: string },
): Email {
  const label = monthName(year, month);
  const last = lastDayName(year, month);
  const days = `${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  const todo = `To do: log anything you paid for the house this month (groceries, the helper, a service)`;
  const subject =
    kind === "last_day"
      ? `Today is the last day to log your ${label} expenses`
      : kind === "three_days"
        ? `${label} locks in ${days}: log your expenses`
        : `${days} left to log your ${label} expenses`;
  return {
    subject,
    text: paragraphs(
      `Hi ${name},`,
      kind === "last_day" ? `Today is the last day of ${label}.` : `${days} left in ${label}.`,
      kind === "last_day" ? `${todo} today.` : `${todo}, so it's counted when ${label}'s bills are split.`,
      kind === "last_day"
        ? `From tomorrow ${label} is locked: you can't add to it or change it anymore. Anything new goes in next month.`
        : `${label} locks after ${last}. After that you can't add to it anymore.`,
      `Log it here: ${link}`,
      SIGN_OFF,
    ),
  };
}

/** "Your bill is ready", from Settle Up's button. Null when there's nothing to tell them. */
export function payablesEmail({
  name,
  year,
  month,
  payables,
  carriedOver,
  collectorName,
  link,
}: {
  name: string;
  year: number;
  month: number;
  payables: Payables;
  /** Their Prev Month Unsettled when it's something they owed (it's in the Final). */
  carriedOver: Centavos;
  collectorName: string;
  link: string;
}): Email | null {
  const label = monthName(year, month);
  const intro = `${label}'s bills are in and everyone's share is worked out.`;
  if (payables.kind === "owed") {
    return {
      subject: `${label} is worked out: you get ${formatPHP(payables.amount)} back`,
      text: paragraphs(
        `Hi ${name},`,
        intro,
        `You get back: ${formatPHP(payables.amount)}\n(you paid more than your share)`,
        `Nothing to do: ${collectorName} sends it from the ${HOUSE_BUDGET_LABEL}, and it shows in Settle Up once it's sent.`,
        `See the details: ${link}`,
        SIGN_OFF,
      ),
    };
  }
  if (payables.kind === "settled" || payables.left === 0) return null;
  // Last month's unpaid amount is in the Final: say how it relates to what's due.
  const carried =
    carriedOver <= 0
      ? null
      : carriedOver < payables.due
        ? `(includes ${formatPHP(carriedOver)} still unpaid from last month)`
        : `(still unpaid from last month)`;
  const amounts = [
    `Your share: ${formatPHP(payables.due)}`,
    carried,
    payables.waiting > 0 && `Already sent, waiting for ${collectorName} to confirm: ${formatPHP(payables.waiting)}`,
    payables.waiting > 0 && `Left to pay: ${formatPHP(payables.left)}`,
  ].filter((line) => typeof line === "string");
  return {
    subject: `Your ${label} bill is ready: ${formatPHP(payables.left)}`,
    text: paragraphs(
      `Hi ${name},`,
      intro,
      amounts.join("\n"),
      `To do: send ${formatPHP(payables.left)} to the ${HOUSE_BUDGET_LABEL}, then open Settle Up, tap "I paid" on your row and attach the screenshot of your transfer.`,
      `Settle Up: ${link}`,
      SIGN_OFF,
    ),
  };
}

/**
 * To the admin, when the daily job couldn't start the next month by itself (`reason` is why, from
 * startNextMonthIn — e.g. a waiting payment). It tries again every morning.
 */
export function startBlockedEmail({
  name,
  year,
  month,
  reason,
  link,
}: {
  name: string;
  /** The month that ended (the one after it couldn't start). */
  year: number;
  month: number;
  reason: string;
  link: string;
}): Email {
  const label = monthName(year, month);
  const after = monthAfter(year, month);
  const next = monthName(after.year, after.month, year);
  return {
    subject: `Couldn't start ${next}`,
    text: paragraphs(
      `Hi ${name},`,
      `${label} has ended, but ${next} couldn't start by itself, so housemates have nowhere to log new expenses yet.`,
      `Why: ${reason}`,
      `To do: fix that. ${next} then starts by itself tomorrow morning — or press Start ${next} in the month picker to start it now.`,
      `Open My House: ${link}`,
      ADMIN_SIGN_OFF,
    ),
  };
}

/** To the admin: the nudges (lib/reminders.ts → adminNudge), once each per month. */
export function readyEmail({
  name,
  kind,
  year,
  month,
  link,
}: {
  name: string;
  kind: "email_bill" | "close";
  year: number;
  month: number;
  link: string;
}): Email {
  const label = monthName(year, month);
  if (kind === "email_bill") {
    return {
      subject: `${label}'s bills are all in: ready to email everyone`,
      text: paragraphs(
        `Hi ${name},`,
        `Every bill for ${label} is in and confirmed, and the numbers work out.`,
        `To do: check the amounts in Settle Up, then press "Email ${label}'s bill" so everyone gets their share.`,
        `Settle Up: ${link}`,
        ADMIN_SIGN_OFF,
      ),
    };
  }
  return {
    subject: `Everyone has paid for ${label}: ready to close`,
    text: paragraphs(
      `Hi ${name},`,
      `Everyone has settled ${label}, and nothing is pending or waiting.`,
      `To do: close ${label} in Settle Up. That locks its numbers for good (you can reopen it if needed).`,
      `Settle Up: ${link}`,
      ADMIN_SIGN_OFF,
    ),
  };
}
