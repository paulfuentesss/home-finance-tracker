// Loads the months the Trends tab needs (docs/features/trends.md); the numbers are worked out
// by buildTrends in lib/trends.ts (pure, tested).

import "server-only";
import { and, desc, eq, lt, lte, or } from "drizzle-orm";
import { billingPeriods, db } from "@/db";
import { requireViewer } from "@/lib/auth";
import { todayInManila } from "@/lib/format";
import { toCentavos } from "@/lib/money";
import { buildTrends, LOOKBACK_MONTHS, type Range, type Trends } from "@/lib/trends";

/**
 * The Trends numbers for the `range` months ending at year/month. Household-wide totals, the
 * same for everyone who can open the month, so a preview needs nothing different.
 */
export async function getTrends(year: number, month: number, range: Range): Promise<Trends> {
  await requireViewer();
  const periods = await db.query.billingPeriods.findMany({
    columns: { year: true, month: true, status: true },
    where: or(
      lt(billingPeriods.year, year),
      and(eq(billingPeriods.year, year), lte(billingPeriods.month, month)),
    ),
    orderBy: [desc(billingPeriods.year), desc(billingPeriods.month)],
    limit: LOOKBACK_MONTHS,
    with: {
      billItems: { columns: { name: true, kind: true, status: true, totalAmount: true } },
      advances: { columns: { category: true, description: true, amount: true } },
      balances: { columns: { memberId: true } },
    },
  });
  return buildTrends(
    periods.map((p) => ({
      year: p.year,
      month: p.month,
      status: p.status,
      bills: p.billItems.map((b) => ({ name: b.name, kind: b.kind, status: b.status, total: toCentavos(b.totalAmount) })),
      advances: p.advances.map((a) => ({ category: a.category, description: a.description, amount: toCentavos(a.amount) })),
      people: p.balances.length,
    })),
    range,
    todayInManila(),
  );
}
