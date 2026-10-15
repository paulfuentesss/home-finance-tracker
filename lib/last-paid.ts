// "Last paid Aug. 12 · 2 months ago" under a housemate's own number in the greeting
// (components/greeting.tsx). Pure and browser-safe (type imports only); no money math here.

import { dateLabel, dayLabel } from "@/lib/format";
import type { PaymentStatus } from "@/lib/permissions";
import type { MemberId, Party } from "@/lib/settlement";

export interface LastPaid {
  /** "Aug. 12", or "Dec. 12, 2025" when it isn't this year. */
  label: string;
  /** Whole months since then (Sept. 30 → Oct. 1 is 0), never below 0. */
  monthsAgo: number;
}

/**
 * When a member last paid: their latest confirmed payment, to anyone (usually the House Budget,
 * but any other pair is allowed too, docs/settlement-rules.md → Payments). A waiting or rejected
 * one doesn't count. Null when there's none on record (payments from before the app aren't).
 * `today` is "YYYY-MM-DD" in Manila, worked out on the server.
 */
export function lastPaidOf(
  payments: readonly { fromMemberId: Party; status: PaymentStatus; paidOn: string }[],
  memberId: MemberId,
  today: string,
): LastPaid | null {
  // "YYYY-MM-DD" strings sort like the dates they are.
  const latest = payments
    .filter((p) => p.fromMemberId === memberId && p.status === "confirmed")
    .reduce<string | null>((max, p) => (max === null || p.paidOn > max ? p.paidOn : max), null);
  if (latest === null) return null;

  // Read straight from the strings, like dayLabel: calendar dates, no timezone to shift them.
  const [py, pm, pd] = latest.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const months = ty * 12 + tm - (py * 12 + pm) - (td < pd ? 1 : 0);
  return {
    label: py === ty ? dayLabel(latest) : dateLabel(latest),
    monthsAgo: Math.max(0, months),
  };
}
