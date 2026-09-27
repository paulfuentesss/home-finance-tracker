// Display helpers shared by Server and Client Components.

const monthFormatter = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormatter = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });

/** (2026, 8) → "August 2026" */
export function monthLabel(year: number, month: number): string {
  return monthFormatter.format(Date.UTC(year, month - 1, 1));
}

/**
 * "2026-08-19" → "Aug 19". Date-only strings are formatted in UTC on purpose: they're
 * calendar dates, not moments in time, so no timezone should shift them.
 */
export function dayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return dayFormatter.format(Date.UTC(y, m - 1, d));
}

/** Today's date in Manila as "YYYY-MM-DD" (for date inputs). */
export function todayInManila(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

export const CATEGORY_LABELS = {
  grocery: "Grocery",
  food: "Food",
  service: "Service",
  misc: "Misc",
} as const;
