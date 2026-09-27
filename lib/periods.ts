// Loads a billing period from the database and shapes it for the UI.
// Everything returned here is plain JSON (no Maps) so it can be passed to Client Components.

import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { billingPeriods, db } from "@/db";
import { toCentavos, type Centavos } from "@/lib/money";
import { computeMonth, type SettlementMember } from "@/lib/settlement";

export type Category = "grocery" | "food" | "service" | "misc";

export interface PeriodSummary {
  id: number;
  year: number;
  month: number;
}

export interface PeriodView {
  period: PeriodSummary & { status: "open" | "closed" };
  members: SettlementMember[];
  bills: {
    id: number;
    name: string;
    total: Centavos;
    paidById: number;
    status: "confirmed" | "pending";
  }[];
  rows: {
    memberId: number;
    name: string;
    isCollector: boolean;
    /** Keyed by bill id (as string, for JSON). */
    billShares: Record<string, Centavos>;
    advanceShare: Centavos;
    ownAdvances: Centavos;
    billPayerCredit: Centavos;
    monthFinal: Centavos;
    balance: Centavos;
  }[];
  advances: {
    id: number;
    payerId: number;
    payerName: string;
    category: Category;
    description: string;
    amount: Centavos;
    spentOn: string;
    customSplit: boolean;
  }[];
  prev: PeriodSummary | null;
  next: PeriodSummary | null;
}

export async function getLatestPeriod(): Promise<PeriodSummary | null> {
  const [latest] = await db
    .select({ id: billingPeriods.id, year: billingPeriods.year, month: billingPeriods.month })
    .from(billingPeriods)
    .orderBy(desc(billingPeriods.year), desc(billingPeriods.month))
    .limit(1);
  return latest ?? null;
}

export async function getPeriodView(year: number, month: number): Promise<PeriodView | null> {
  const period = await db.query.billingPeriods.findFirst({
    where: and(eq(billingPeriods.year, year), eq(billingPeriods.month, month)),
    with: {
      balances: { with: { member: true } },
      billItems: { with: { shares: true }, orderBy: (b) => [asc(b.id)] },
      advances: { with: { shares: true }, orderBy: (a) => [asc(a.spentOn), asc(a.id)] },
      payments: true,
    },
  });
  if (!period) return null;

  // The period's members are the ones with a period_balances row (see docs/settlement-rules.md).
  const members = period.balances
    .map((b) => b.member)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));

  // TODO(close-month): while the previous month is still open, compute the opening balance
  // live from it. Until month closing exists, the stored opening balance is used.
  const settlement = computeMonth({
    members,
    bills: period.billItems,
    billShares: new Map(period.billItems.map((b) => [b.id, b.shares])),
    advances: period.advances,
    advanceShares: new Map(period.advances.filter((a) => a.shares.length > 0).map((a) => [a.id, a.shares])),
    payments: period.payments,
    openingBalances: new Map(period.balances.map((b) => [b.memberId, b.openingBalance])),
  });

  const { prev, next } = await adjacentPeriods(year, month);

  return {
    period: { id: period.id, year: period.year, month: period.month, status: period.status },
    members: members.map(({ id, name, sortOrder, isCollector }) => ({ id, name, sortOrder, isCollector })),
    bills: period.billItems.map((b) => ({
      id: b.id,
      name: b.name,
      total: toCentavos(b.totalAmount),
      paidById: b.paidById,
      status: b.status,
    })),
    rows: settlement.map((r) => ({
      memberId: r.member.id,
      name: r.member.name,
      isCollector: r.member.isCollector,
      billShares: Object.fromEntries([...r.billShares].map(([billId, c]) => [String(billId), c])),
      advanceShare: r.advanceShare,
      ownAdvances: r.ownAdvances,
      billPayerCredit: r.billPayerCredit,
      monthFinal: r.monthFinal,
      balance: r.balance,
    })),
    advances: period.advances.map((a) => ({
      id: a.id,
      payerId: a.payerId,
      payerName: nameOf.get(a.payerId) ?? "Unknown",
      category: a.category,
      description: a.description,
      amount: toCentavos(a.amount),
      spentOn: a.spentOn,
      customSplit: a.shares.length > 0,
    })),
    prev,
    next,
  };
}

async function adjacentPeriods(year: number, month: number) {
  const all = await db
    .select({ id: billingPeriods.id, year: billingPeriods.year, month: billingPeriods.month })
    .from(billingPeriods)
    .orderBy(asc(billingPeriods.year), asc(billingPeriods.month));
  const index = all.findIndex((p) => p.year === year && p.month === month);
  return { prev: all[index - 1] ?? null, next: all[index + 1] ?? null };
}
