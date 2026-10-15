// Loads the months the Trends tab needs (docs/features/trends.md); the numbers are worked out
// by buildTrends in lib/trends.ts (pure, tested).

import "server-only";
import { and, desc, eq, lt, lte, or } from "drizzle-orm";
import { billingPeriods, db } from "@/db";
import { requireViewer } from "@/lib/auth";
import { todayInManila } from "@/lib/format";
import { toCentavos } from "@/lib/money";
import { buildTrends, LOOKBACK_MONTHS, RANGES, type Range, type Trends } from "@/lib/trends";

/**
 * The Trends numbers for every range (1, 3 and 6 months) ending at year/month, so the page can
 * switch between them in the browser without asking the server again. One query: any range needs
 * the same `LOOKBACK_MONTHS`. Household-wide totals, the same for everyone who can open the month,
 * so a preview needs nothing different.
 */
export async function getAllTrends(year: number, month: number): Promise<Record<Range, Trends>> {
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
  const inputs = periods.map((p) => ({
    year: p.year,
    month: p.month,
    status: p.status,
    bills: p.billItems.map((b) => ({ name: b.name, kind: b.kind, status: b.status, total: toCentavos(b.totalAmount) })),
    advances: p.advances.map((a) => ({ category: a.category, description: a.description, amount: toCentavos(a.amount) })),
    people: p.balances.length,
  }));
  const today = todayInManila();
  return Object.fromEntries(RANGES.map((range) => [range, buildTrends(inputs, range, today)])) as Record<
    Range,
    Trends
  >;
}
