// Display helpers shared by Server and Client Components.

const monthFormatter = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
// Household style: abbreviated with a period, except the short months ("Sept. 6", "March 4").
const DAY_MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

/** (2026, 8) → "August 2026" */
export function monthLabel(year: number, month: number): string {
  return monthFormatter.format(Date.UTC(year, month - 1, 1));
}

const SHORT_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** 10 → "OCT": the split table's corner on phones, once it's scrolled sideways. */
export function shortMonthName(month: number): string {
  return SHORT_MONTHS[month - 1];
}

/** (2026, 9) → "SEP 2026": the month picker on phones and the split table's corner. */
export function shortMonthLabel(year: number, month: number): string {
  return `${shortMonthName(month)} ${year}`;
}

/**
 * "2026-09-06" → "Sept. 6". Read straight from the string, not through a Date, because
 * these are calendar dates, not moments in time, so no timezone should shift them.
 */
export function dayLabel(isoDate: string): string {
  const [, m, d] = isoDate.split("-").map(Number);
  return `${DAY_MONTHS[m - 1]} ${d}`;
}

/** "2026-09-06" → "Sept. 6, 2026" (same household style as dayLabel, with the year). */
export function dateLabel(isoDate: string): string {
  return `${dayLabel(isoDate)}, ${isoDate.slice(0, 4)}`;
}

/** A moment's calendar date in Manila as "YYYY-MM-DD" (e.g. when a month was closed). */
export function dateInManila(moment: Date): string {
  return moment.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days between two "YYYY-MM-DD" dates: ("2026-10-31", "2026-11-03") → 3. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** A moment in Manila as "Oct. 11, 2026, 3:00 PM" (e.g. when the last backup was taken). */
export function momentLabel(moment: Date): string {
  const time = moment.toLocaleTimeString("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  return `${dateLabel(dateInManila(moment))}, ${time}`;
}

export type PartOfDay = "morning" | "afternoon" | "evening";

/**
 * The part of the day in Manila, for the greeting ("Good morning"): morning until noon,
 * afternoon until 6 PM, evening after (night included). Worked out on the server, so the page
 * and the browser can't disagree.
 */
export function partOfDayInManila(moment: Date): PartOfDay {
  const hour = Number(moment.toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" }));
  if (hour >= 4 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

/** Today's date in Manila as "YYYY-MM-DD" (for date inputs). */
export function todayInManila(): string {
  return dateInManila(new Date());
}

export const CATEGORY_LABELS = {
  grocery: "Grocery",
  food: "Food",
  service: "Service",
  misc: "Misc",
} as const;
