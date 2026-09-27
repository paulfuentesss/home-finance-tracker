// Loads billing periods from the database and shapes them for the UI.
// Everything returned is plain JSON (no Maps) so it can be passed to Client Components.

import "server-only";
import { asc, desc } from "drizzle-orm";
import { cache } from "react";
import { billingPeriods, db } from "@/db";
import { memberDotClass } from "@/lib/members";
import { sumCentavos, toCentavos, type Centavos } from "@/lib/money";
import {
  computeMonth,
  openingBalancesFrom,
  SettlementError,
  type MemberId,
  type MonthInput,
  type MonthResult,
  type SettlementMember,
  type SplitMode,
} from "@/lib/settlement";

export type Category = "grocery" | "food" | "service" | "misc";

export interface PeriodSummary {
  id: number;
  year: number;
  month: number;
}

export interface ViewMember extends SettlementMember {
  dotClass: string;
}

export interface ViewBill {
  id: number;
  name: string;
  total: Centavos;
  paidById: number;
  status: "confirmed" | "pending";
  splitMode: SplitMode;
  dueDate: string | null;
  paidOn: string | null;
  /** Keyed by member id (as string, for JSON). */
  shares: Record<string, { amount: Centavos; points: number | null }>;
  /** Sum of points (points mode only). */
  totalPoints: number;
  /** "₱434.73 / person" or "₱1,863.08 / point" (rounded, for display only). */
  perUnit: { amount: Centavos; unit: "person" | "point" } | null;
}

export interface ViewRow {
  memberId: number;
  billShares: Record<string, Centavos>;
  /** Keyed by shared column id (as string). */
  columnShares: Record<string, Centavos>;
  total: Centavos;
  ownAdvances: Centavos;
  billsPaid: Centavos;
  monthFinal: Centavos;
  opening: Centavos;
  balance: Centavos;
}

export interface ViewAdvance {
  id: number;
  payerId: number;
  category: Category;
  description: string;
  amount: Centavos;
  spentOn: string | null;
  columnId: number;
  /** The column's name when it isn't the month's default column. */
  columnTag: string | null;
}

export interface ViewColumn {
  id: number;
  name: string;
  splitMode: "equal" | "manual";
  isDefault: boolean;
  /** Sum of the advances logged into it. */
  total: Centavos;
  /** Manual: typed amounts − total (0 when it adds up). */
  difference: Centavos;
  /** Equal: who shares it. */
  includedIds: number[];
  /** Manual: typed amount per member id (as string). */
  amounts: Record<string, Centavos | null>;
}

export interface PeriodView {
  period: PeriodSummary & { status: "open" | "closed" };
  members: ViewMember[];
  bills: ViewBill[];
  /** Shared-advances columns ("Advances Shared", "… w/o PA", "Ice Maker Adj."). */
  columns: ViewColumn[];
  rows: ViewRow[];
  advances: ViewAdvance[];
  stats: { coreBills: Centavos; sharedAdvances: Centavos };
  periods: PeriodSummary[];
  prev: PeriodSummary | null;
  next: PeriodSummary | null;
  isLatest: boolean;
  /** Set when the numbers can't be computed (e.g. shares that don't add up). */
  issue: string | null;
}

const loadPeriods = () =>
  db.query.billingPeriods.findMany({
    orderBy: [asc(billingPeriods.year), asc(billingPeriods.month)],
    with: {
      balances: { with: { member: true } },
      billItems: { with: { shares: true }, orderBy: (b) => [asc(b.id)] },
      sharedColumns: { with: { members: true }, orderBy: (c) => [asc(c.id)] },
      advances: { orderBy: (a) => [asc(a.spentOn), asc(a.id)] },
      payments: true,
    },
  });

type LoadedPeriod = Awaited<ReturnType<typeof loadPeriods>>[number];

export async function getLatestPeriod(): Promise<PeriodSummary | null> {
  const [latest] = await db
    .select({ id: billingPeriods.id, year: billingPeriods.year, month: billingPeriods.month })
    .from(billingPeriods)
    .orderBy(desc(billingPeriods.year), desc(billingPeriods.month))
    .limit(1);
  return latest ?? null;
}

/**
 * One month, fully computed. Wrapped in React `cache()` so the layout and the tab page
 * share a single database round trip per request.
 */
export const getPeriodView = cache(async (year: number, month: number): Promise<PeriodView | null> => {
  // The whole history is small (a handful of rows per month), and carry-over needs every
  // earlier month anyway, so load it in one query.
  const all = await loadPeriods();
  const index = all.findIndex((p) => p.year === year && p.month === month);
  if (index === -1) return null;

  // Live carry-over: each month opens with the previous month's Final. The first month,
  // and any month after a closed one, uses its stored opening balances instead.
  let opening = new Map<MemberId, Centavos>();
  let result: MonthResult | null = null;
  let issue: string | null = null;
  for (let i = 0; i <= index; i++) {
    const period = all[i];
    if (i === 0 || all[i - 1].status === "closed") {
      opening = new Map(period.balances.map((b) => [b.memberId, toCentavos(b.openingBalance)]));
    }
    try {
      result = computeMonth(toMonthInput(period, opening));
      opening = openingBalancesFrom(result);
    } catch (error) {
      if (!(error instanceof SettlementError)) throw error;
      const label = `${period.year}-${String(period.month).padStart(2, "0")}`;
      issue = i === index ? error.message : `Carry-over from ${label} couldn't be computed: ${error.message}`;
      result = null;
      opening = new Map();
    }
  }

  const period = all[index];
  const members = periodMembers(period).map((m) => ({
    id: m.id,
    name: m.name,
    sortOrder: m.sortOrder,
    isCollector: m.isCollector,
    dotClass: memberDotClass(m.sortOrder - 1),
  }));
  const summaries = all.map(({ id, year, month }) => ({ id, year, month }));

  const bills: ViewBill[] = period.billItems.map((b) => {
    const total = toCentavos(b.totalAmount);
    const totalPoints = b.shares.reduce((sum, s) => sum + (s.points === null ? 0 : Number(s.points)), 0);
    const perUnit =
      b.splitMode === "equal" && members.length > 0
        ? { amount: Math.round(total / members.length), unit: "person" as const }
        : b.splitMode === "points" && totalPoints > 0
          ? { amount: Math.round(total / totalPoints), unit: "point" as const }
          : null;
    return {
      id: b.id,
      name: b.name,
      total,
      paidById: b.paidById,
      status: b.status,
      splitMode: b.splitMode,
      dueDate: b.dueDate,
      paidOn: b.paidOn,
      shares: Object.fromEntries(
        b.shares.map((s) => [
          String(s.memberId),
          { amount: toCentavos(s.amount), points: s.points === null ? null : Number(s.points) },
        ]),
      ),
      totalPoints,
      perUnit,
    };
  });

  const columns: ViewColumn[] = period.sharedColumns.map((c) => {
    const computed = result?.columns.find((r) => r.id === c.id);
    const includedIds = members.filter((m) => c.members.some((x) => x.memberId === m.id && x.included)).map((m) => m.id);
    return {
      id: c.id,
      name: c.name,
      splitMode: c.splitMode === "manual" ? "manual" : "equal",
      isDefault: c.isDefault,
      total:
        computed?.total ??
        sumCentavos(period.advances.filter((a) => a.columnId === c.id).map((a) => toCentavos(a.amount))),
      difference: computed?.difference ?? 0,
      includedIds,
      amounts: Object.fromEntries(
        c.members.map((m) => [String(m.memberId), m.amount === null ? null : toCentavos(m.amount)]),
      ),
    };
  });
  const columnById = new Map(columns.map((c) => [c.id, c]));

  return {
    period: { id: period.id, year: period.year, month: period.month, status: period.status },
    members,
    bills,
    columns,
    rows: (result?.rows ?? []).map((r) => ({
      memberId: r.member.id,
      billShares: mapToRecord(r.billShares),
      columnShares: mapToRecord(r.columnShares),
      total: r.total,
      ownAdvances: r.ownAdvances,
      billsPaid: r.billsPaid,
      monthFinal: r.monthFinal,
      opening: r.opening,
      balance: r.balance,
    })),
    advances: period.advances.map((a) => ({
      id: a.id,
      payerId: a.payerId,
      category: a.category,
      description: a.description,
      amount: toCentavos(a.amount),
      spentOn: a.spentOn,
      columnId: a.columnId,
      columnTag: columnById.get(a.columnId)?.isDefault === false ? columnById.get(a.columnId)!.name : null,
    })),
    stats: {
      coreBills: sumCentavos(bills.filter((b) => b.status === "confirmed").map((b) => b.total)),
      sharedAdvances: sumCentavos(period.advances.map((a) => toCentavos(a.amount))),
    },
    periods: summaries,
    prev: summaries[index - 1] ?? null,
    next: summaries[index + 1] ?? null,
    isLatest: index === all.length - 1,
    issue,
  };
});

/** Points-mode bills in the latest month, for the "How it works" page. */
export async function getLatestPointsBills() {
  const latest = await getLatestPeriod();
  if (!latest) return { period: null, bills: [] as ViewBill[], members: [] as ViewMember[] };
  const view = await getPeriodView(latest.year, latest.month);
  return {
    period: latest,
    bills: (view?.bills ?? []).filter((b) => b.splitMode === "points"),
    members: view?.members ?? [],
  };
}

function periodMembers(period: LoadedPeriod) {
  return period.balances.map((b) => b.member).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

function toMonthInput(period: LoadedPeriod, opening: Map<MemberId, Centavos>): MonthInput {
  return {
    members: periodMembers(period),
    bills: period.billItems,
    billShares: new Map(period.billItems.map((b) => [b.id, b.shares])),
    sharedColumns: period.sharedColumns.map((c) => ({
      id: c.id,
      name: c.name,
      splitMode: c.splitMode === "manual" ? "manual" : "equal",
      members: c.members,
    })),
    advances: period.advances,
    payments: period.payments,
    openingBalances: opening,
  };
}

function mapToRecord<K extends string | number>(map: Map<K, Centavos>): Record<string, Centavos> {
  return Object.fromEntries([...map].map(([k, v]) => [String(k), v]));
}
