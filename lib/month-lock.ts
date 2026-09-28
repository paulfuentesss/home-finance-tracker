// Rules for closing and reopening months (docs/settlement-rules.md → "Closing and reopening").
// Pure functions so they're easy to test; the Server Actions and the UI both use them.

import { monthLabel } from "@/lib/format";
import type { Centavos } from "@/lib/money";
import type { MemberId } from "@/lib/settlement";

export interface LockCheck {
  ok: boolean;
  /** Why it can't be done, in words for the household. */
  reason?: string;
}

interface MonthRef {
  year: number;
  month: number;
  status: "open" | "closed";
}

/**
 * Months close oldest-first: a closed month's opening balance must itself be locked, or
 * editing an earlier month could still change it.
 */
export function closeCheck(current: MonthRef, prev: MonthRef | null, issue: string | null): LockCheck {
  if (current.status === "closed") return { ok: false, reason: "This month is already closed." };
  if (prev && prev.status !== "closed") {
    return { ok: false, reason: `Close ${monthLabel(prev.year, prev.month)} first.` };
  }
  if (issue) return { ok: false, reason: "Fix the problem above first; the numbers can't be calculated yet." };
  return { ok: true };
}

/** Months reopen newest-first, so a closed month never follows an open one. */
export function reopenCheck(current: MonthRef, next: MonthRef | null): LockCheck {
  if (current.status === "open") return { ok: false, reason: "This month is already open." };
  if (next && next.status !== "open") {
    return { ok: false, reason: `Reopen ${monthLabel(next.year, next.month)} first.` };
  }
  return { ok: true };
}

/**
 * Members whose unsettled Final would be lost because they aren't in the next month (e.g.
 * they moved out). Empty when there's no next month yet.
 */
export function vanishingBalances(
  finals: ReadonlyMap<MemberId, Centavos>,
  nextMemberIds: ReadonlySet<MemberId> | null,
): MemberId[] {
  if (!nextMemberIds) return [];
  return [...finals].filter(([id, balance]) => balance !== 0 && !nextMemberIds.has(id)).map(([id]) => id);
}
