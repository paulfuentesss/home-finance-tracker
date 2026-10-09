// Loads billing periods from the database and shapes them for the UI.
// Everything returned is plain JSON (no Maps) so it can be passed to Client Components.

import "server-only";
import { asc, desc, eq, or } from "drizzle-orm";
import { cache } from "react";
import { billingPeriods, billItems, db, payments, receipts } from "@/db";
import type { Database } from "@/db/client";
import { requireViewer } from "@/lib/auth";
import { dateInManila } from "@/lib/format";
import { dotClassOf } from "@/lib/members";
import { closeCheck, reopenCheck, type LockCheck } from "@/lib/month-lock";
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
  /** "email" = filled in from a bill email. */
  source: "manual" | "email";
  /** The email it came from: the billed amount and the payment fee added (why the total is higher). */
  emailed: { amount: Centavos; fee: Centavos; feeNote: string | null } | null;
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
  paidOut: Centavos;
  received: Centavos;
  balance: Centavos;
}

export interface ViewPayment {
  id: number;
  fromMemberId: number;
  toMemberId: number;
  amount: Centavos;
  paidOn: string;
  note: string | null;
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
  period: PeriodSummary & {
    status: "open" | "closed";
    /** Manila calendar date it was closed ("YYYY-MM-DD"). */
    closedOn: string | null;
  };
  members: ViewMember[];
  bills: ViewBill[];
  /** Shared-advances columns ("Advances Shared", "… w/o PA", "Ice Maker Adj."). */
  columns: ViewColumn[];
  rows: ViewRow[];
  advances: ViewAdvance[];
  payments: ViewPayment[];
  stats: { coreBills: Centavos; sharedAdvances: Centavos };
  periods: PeriodSummary[];
  prev: PeriodSummary | null;
  next: PeriodSummary | null;
  isLatest: boolean;
  canClose: LockCheck;
  canReopen: LockCheck;
  /** Set when the numbers can't be computed (e.g. shares that don't add up). */
  issue: string | null;
}

/** The app's `db` or a transaction (Server Actions pass `tx` for a consistent snapshot). */
export type Executor = Pick<Database, "query">;

const loadPeriods = (executor: Executor = db) =>
  executor.query.billingPeriods.findMany({
    orderBy: [asc(billingPeriods.year), asc(billingPeriods.month)],
    with: {
      balances: { with: { member: true } },
      billItems: { with: { shares: true, emails: true }, orderBy: (b) => [asc(b.id)] },
      sharedColumns: { with: { members: true }, orderBy: (c) => [asc(c.id)] },
      advances: { orderBy: (a) => [asc(a.spentOn), asc(a.id)] },
      payments: { orderBy: (p) => [asc(p.paidOn), asc(p.id)] },
    },
  });

type LoadedPeriod = Awaited<ReturnType<typeof loadPeriods>>[number];

// Page reads go through getLatestPeriod / getPeriodView / getLatestPointsBills, and each one
// requires a signed-in member first (lib/auth.ts). computePeriod is also used by actions,
// which check the caller in run().

export async function getLatestPeriod(): Promise<PeriodSummary | null> {
  await requireViewer();
  const [latest] = await db
    .select({ id: billingPeriods.id, year: billingPeriods.year, month: billingPeriods.month })
    .from(billingPeriods)
    .orderBy(desc(billingPeriods.year), desc(billingPeriods.month))
    .limit(1);
  return latest ?? null;
}

/**
 * Every month up to `year`/`month`, with that month's numbers computed (null when it doesn't
 * exist). Used by the pages and by Server Actions that need a month's Finals (closing a month,
 * removing someone).
 */
export async function computePeriod(executor: Executor, year: number, month: number) {
  // The whole history is small (a handful of rows per month), and carry-over needs every
  // earlier month anyway, so load it in one query.
  const all = await loadPeriods(executor);
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
      // Stored balances don't depend on earlier months, so an earlier problem no longer matters.
      issue = null;
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
  return { all, index, period: all[index], result, issue };
}

/**
 * One month, fully computed. Wrapped in React `cache()` so the layout and the tab page
 * share a single database round trip per request.
 */
export const getPeriodView = cache(async (year: number, month: number): Promise<PeriodView | null> => {
  await requireViewer();
  const computed = await computePeriod(db, year, month);
  if (!computed) return null;
  const { all, index, period, result, issue } = computed;

  // Field by field, never a spread: member rows hold login details (email, auth_user_id) that
  // must not reach the browser.
  const members = periodMembers(period).map((m) => ({
    id: m.id,
    name: m.name,
    sortOrder: m.sortOrder,
    isCollector: m.isCollector,
    dotClass: dotClassOf(m),
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
      source: b.source,
      emailed: emailedOf(b.emails),
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
    period: {
      id: period.id,
      year: period.year,
      month: period.month,
      status: period.status,
      closedOn: period.closedAt ? dateInManila(period.closedAt) : null,
    },
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
      paidOut: r.paidOut,
      received: r.received,
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
    payments: period.payments.map((p) => ({
      id: p.id,
      fromMemberId: p.fromMemberId,
      toMemberId: p.toMemberId,
      amount: toCentavos(p.amount),
      paidOn: p.paidOn,
      note: p.note,
    })),
    stats: {
      coreBills: sumCentavos(bills.filter((b) => b.status === "confirmed").map((b) => b.total)),
      sharedAdvances: sumCentavos(period.advances.map((a) => toCentavos(a.amount))),
    },
    periods: summaries,
    prev: summaries[index - 1] ?? null,
    next: summaries[index + 1] ?? null,
    isLatest: index === all.length - 1,
    canClose: closeCheck(period, all[index - 1] ?? null, issue, pendingBillNames(period)),
    canReopen: reopenCheck(period, all[index + 1] ?? null),
    issue,
  };
});

export interface ViewReceipt {
  id: number;
  /** Exactly one of these is set. */
  billItemId: number | null;
  paymentId: number | null;
  contentType: string;
  originalName: string | null;
}

/**
 * A month's receipts (bills and payments), oldest first. Separate from getPeriodView, whose
 * query loads every month: only the Receipts tab needs these.
 */
export async function getPeriodReceipts(periodId: number): Promise<ViewReceipt[]> {
  await requireViewer();
  return db
    .select({
      id: receipts.id,
      billItemId: receipts.billItemId,
      paymentId: receipts.paymentId,
      contentType: receipts.contentType,
      originalName: receipts.originalName,
    })
    .from(receipts)
    .leftJoin(billItems, eq(billItems.id, receipts.billItemId))
    .leftJoin(payments, eq(payments.id, receipts.paymentId))
    .where(or(eq(billItems.periodId, periodId), eq(payments.periodId, periodId)))
    .orderBy(asc(receipts.id));
}

/** Points-mode bills in the latest month, for the "How it works" page. */
export async function getLatestPointsBills() {
  await requireViewer();
  const latest = await getLatestPeriod();
  if (!latest) return { period: null, bills: [] as ViewBill[], members: [] as ViewMember[] };
  const view = await getPeriodView(latest.year, latest.month);
  return {
    period: latest,
    bills: (view?.bills ?? []).filter((b) => b.splitMode === "points"),
    members: view?.members ?? [],
  };
}

function emailedOf(emails: LoadedPeriod["billItems"][number]["emails"]): ViewBill["emailed"] {
  const email = emails.find((e) => e.status === "imported" && e.amount !== null);
  if (!email) return null;
  return {
    amount: toCentavos(email.amount!),
    fee: email.fee === null ? 0 : toCentavos(email.fee),
    feeNote: email.feeNote,
  };
}

export function pendingBillNames(period: LoadedPeriod): string[] {
  return period.billItems.filter((b) => b.status === "pending").map((b) => b.name);
}

export function periodMembers(period: LoadedPeriod) {
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
