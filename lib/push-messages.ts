// The words of every push notification My House sends (docs/features/notifications.md). Pure, so
// the wording is tested. A push is a short nudge that opens the right page; the email (when there
// is one) stays the full record.
//
// Rules: **no amounts** — a notification shows on the lock screen, where anyone near the phone can
// read it — and nothing anyone typed (a rejection's reason). Only moments where something is due
// soon push; the rest stay email-only (PUSHES). `tag` makes a newer push about the same thing
// replace the older one on the phone instead of piling up. `url` is a path in the app.

import type { reminderKind } from "@/db/schema";
import { monthLabel } from "@/lib/format";
import { HOUSE_BUDGET_LABEL } from "@/lib/household-config";
import { monthAfter } from "@/lib/month-lock";
import type { MonthEndReminder, Payables } from "@/lib/reminders";

export interface Push {
  title: string;
  body: string;
  /** A path in the app ("/periods/2026/10/settle"), opened when the notification is tapped. */
  url: string;
  tag: string;
}

type ReminderKind = (typeof reminderKind.enumValues)[number];

/**
 * Which emailed reminders also push. The early month-end reminders and the view-only "bills are
 * in" note stay email-only, so a phone buzzes only when something is due soon.
 */
export const PUSHES: Record<ReminderKind, boolean> = {
  week: false,
  three_days: false,
  last_day: true,
  start_next: true,
  payables: true,
  ready_bill: true,
  ready_close: true,
  bills_in: false,
  unpaid: true,
};

/** "October" (the year is in the tag and the link, not needed on a phone's lock screen). */
function monthName(year: number, month: number): string {
  return monthLabel(year, month).split(" ")[0];
}

const settle = (year: number, month: number) => `/periods/${year}/${month}/settle`;

/** To a housemate, on the month's last day (the earlier reminders are email-only). */
export function monthEndPush(kind: MonthEndReminder, { year, month }: { year: number; month: number }): Push | null {
  if (!PUSHES[kind]) return null;
  return {
    title: `⏰ Last day to log your ${monthName(year, month)} expenses`,
    body: "Add anything you paid for the house this month before it locks tonight.",
    url: `/periods/${year}/${month}/advances`,
    tag: `month-end-${year}-${month}`,
  };
}

/**
 * To a housemate when the admin emails everyone their bill. `path` is where "I paid" goes (the
 * latest month's Settle Up, like the email's link). Null when the email is null: nothing to tell.
 */
export function billReadyPush({
  year,
  month,
  payables,
  path,
}: {
  year: number;
  month: number;
  payables: Payables;
  path: string;
}): Push | null {
  const label = monthName(year, month);
  const tag = `bill-${year}-${month}`;
  if (payables.kind === "owed") {
    return { title: `💰 Good news! You get money back for ${label}`, body: "Tap to see the details.", url: path, tag };
  }
  if (payables.kind === "settled" || payables.left === 0) return null;
  return {
    title: `🧾 Your ${label} bill is ready`,
    body: "Tap to see your share and pay in Settle Up.",
    url: path,
    tag,
  };
}

/** To a housemate whose emailed bill still isn't fully paid. Replaces the bill push on the phone. */
export function unpaidPush({ year, month, path }: { year: number; month: number; path: string }): Push {
  return {
    title: `💛 Friendly reminder: your ${monthName(year, month)} bill isn't paid yet`,
    body: 'Already paid? Tap "I paid" in Settle Up with the screenshot.',
    url: path,
    tag: `bill-${year}-${month}`,
  };
}

/** To a housemate: the admin confirmed or rejected their "I paid". */
export function paymentDecidedPush({
  status,
  year,
  month,
  collectorName,
}: {
  status: "confirmed" | "rejected";
  year: number;
  month: number;
  collectorName: string;
}): Push {
  const label = monthName(year, month);
  const tag = `payment-${year}-${month}`;
  if (status === "confirmed") {
    return {
      title: `✅ ${collectorName} confirmed your ${label} payment`,
      body: "Thanks for keeping the house running! 🏠",
      url: settle(year, month),
      tag,
    };
  }
  return {
    // The reason stays in the app: it's free text, and the lock screen is public.
    title: `Your ${label} payment needs a look`,
    body: `${collectorName} couldn't confirm it. Tap to see why.`,
    url: settle(year, month),
    tag,
  };
}

/** To the admin: a housemate tapped "I paid". */
export function paymentSentPush({ name, year, month }: { name: string; year: number; month: number }): Push {
  return {
    title: `💸 ${name} sent a payment`,
    body: `Check the ${HOUSE_BUDGET_LABEL}, then confirm it in ${monthName(year, month)}'s Settle Up.`,
    url: settle(year, month),
    // One per payment would pile up; one per sender per month is enough to bring the admin in.
    tag: `paid-${name}-${year}-${month}`,
  };
}

/** To the admin: a bill email filled its column (pending until confirmed). */
export function billArrivedPush({ bill, year, month }: { bill: string; year: number; month: number }): Push {
  return {
    title: `⚡ ${bill}'s ${monthName(year, month)} bill is in`,
    body: "Check it on the Split Table and confirm it.",
    url: `/periods/${year}/${month}`,
    tag: `bill-email-${bill}-${year}-${month}`,
  };
}

/** To the admin: a bill email arrived but couldn't fill its column. `path` is the Bill inbox. */
export function billEmailStuckPush({ path }: { path: string }): Push {
  return {
    title: "A bill email needs a look",
    body: "It couldn't be added by itself. Tap to see why in the Bill inbox.",
    url: path,
    tag: "bill-email-stuck",
  };
}

/** To the admin: the daily job couldn't start the next month. */
export function startBlockedPush({ year, month }: { year: number; month: number }): Push {
  const next = monthAfter(year, month);
  return {
    title: `Couldn't start ${monthName(next.year, next.month)}`,
    body: "Housemates can't log new expenses yet. Tap to see why.",
    url: settle(year, month),
    tag: `start-${next.year}-${next.month}`,
  };
}

/** To the admin: the nudges (ready to email everyone their bill / ready to close). */
export function readyPush({ kind, year, month }: { kind: "email_bill" | "close"; year: number; month: number }): Push {
  const label = monthName(year, month);
  return kind === "email_bill"
    ? {
        title: `${label}'s bills are all in`,
        body: "Ready to email everyone their bill.",
        url: settle(year, month),
        tag: `ready-${year}-${month}`,
      }
    : {
        title: `Everyone has paid for ${label}`,
        body: "Ready to close it.",
        url: settle(year, month),
        tag: `ready-${year}-${month}`,
      };
}

/** "[test → Ben] …": a push sent off the live site to the admin's devices instead (lib/push.ts). */
export function testPush(push: Push, toName: string): Push {
  return { ...push, title: `[test → ${toName}] ${push.title}` };
}
