// Closing a month (docs/settlement-rules.md → "Closing and reopening"): the admin's "Close month"
// button. Takes the transaction as a parameter, like lib/month-start.ts, so lib/month-close.test.ts
// can run it against a real Postgres. The caller checks who's asking: run("admin", …).

import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { billingPeriods, periodBalances } from "@/db";
import type { Tx } from "@/lib/bill-shares";
import { ActionError } from "@/lib/errors";
import { monthLabel } from "@/lib/format";
import { fromCentavos } from "@/lib/money";
import { closeCheck, vanishingBalances } from "@/lib/month-lock";
import { computePeriod, pendingBillNames, periodMembers, waitingPaymentLabels } from "@/lib/periods";
import { openingBalancesFrom } from "@/lib/settlement";

/**
 * Locks a month: saves everyone's Final as their closing balance and, when the next month
 * exists, as its opening balance. Unpaid amounts carry over (docs/settlement-rules.md). Throws an
 * ActionError saying why when it can't.
 */
export async function closeMonthIn(tx: Tx, periodId: number): Promise<void> {
  // Locked first, so no change (a housemate's advance, "I paid", someone added or removed, a
  // bill email) can slip in while it closes, and the month before can't be reopened meanwhile.
  await lockPeriodAndNeighbours(tx, periodId);
  const target = await tx.query.billingPeriods.findFirst({ where: eq(billingPeriods.id, periodId) });
  if (!target) throw new ActionError("That month no longer exists.");
  const computed = await computePeriod(tx, target.year, target.month);
  if (!computed) throw new ActionError("That month no longer exists.");
  const { all, index, period, result, issue } = computed;
  const check = closeCheck(period, all[index - 1] ?? null, issue, pendingBillNames(period), waitingPaymentLabels(period));
  if (!check.ok || !result) throw new ActionError(check.reason ?? "This month can't be closed yet.");

  const finals = openingBalancesFrom(result);
  const next = all[index + 1] ?? null;
  const lost = vanishingBalances(finals, next ? new Set(next.balances.map((b) => b.memberId)) : null);
  if (next && lost.length) {
    const names = periodMembers(period).filter((m) => lost.includes(m.id)).map((m) => m.name);
    throw new ActionError(
      `${names.join(" and ")} ${lost.length === 1 ? "isn't" : "aren't"} in ${monthLabel(next.year, next.month)} but still ${lost.length === 1 ? "has" : "have"} an unsettled balance. Record the payment first.`,
    );
  }

  for (const [memberId, balance] of finals) {
    await tx
      .update(periodBalances)
      .set({ closingBalance: fromCentavos(balance) })
      .where(and(eq(periodBalances.periodId, periodId), eq(periodBalances.memberId, memberId)));
  }
  await tx
    .update(billingPeriods)
    .set({ status: "closed", closedAt: new Date() })
    .where(eq(billingPeriods.id, periodId));
  if (next) {
    for (const b of next.balances) {
      await tx
        .update(periodBalances)
        .set({ openingBalance: fromCentavos(finals.get(b.memberId) ?? 0) })
        .where(and(eq(periodBalances.periodId, next.id), eq(periodBalances.memberId, b.memberId)));
    }
  }
}

/**
 * Locks a month's row for closing and reopening, with the months either side too: closing checks
 * the month before is closed and writes the month after's opening balances, reopening checks the
 * month after is open. Locked oldest first (like openPeriods), so two of these can't block each other.
 */
export async function lockPeriodAndNeighbours(tx: Tx, periodId: number) {
  const ids = (
    await tx.select({ id: billingPeriods.id }).from(billingPeriods).orderBy(asc(billingPeriods.year), asc(billingPeriods.month))
  ).map((p) => p.id);
  const index = ids.indexOf(periodId);
  if (index === -1) return; // gone: the read after the lock says so
  await tx
    .select({ id: billingPeriods.id })
    .from(billingPeriods)
    .where(inArray(billingPeriods.id, ids.slice(Math.max(0, index - 1), index + 2)))
    .orderBy(asc(billingPeriods.year), asc(billingPeriods.month))
    .for("update");
}
