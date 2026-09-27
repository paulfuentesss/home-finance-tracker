// Monthly settlement math. Pure functions only (no DB access) so it's easy to test and
// reuse from Server Components and Server Actions. The rules are in docs/settlement-rules.md.
//
// Full-ledger sign convention (same as the household Google Sheet):
//   positive = member owes, negative = member is owed. Everyone's Month Final sums to 0.

import { splitByWeights, splitEqually, sumCentavos, toCentavos, type Centavos } from "@/lib/money";

export type MemberId = number;
export type SplitMode = "equal" | "points" | "manual";

export interface SettlementMember {
  id: MemberId;
  name: string;
  sortOrder: number;
  isCollector: boolean;
}

export interface SettlementBill {
  id: number;
  name: string;
  totalAmount: string;
  paidById: MemberId;
  status: "confirmed" | "pending";
}

export interface SettlementShare {
  memberId: MemberId;
  amount: string;
}

export interface SettlementAdvance {
  id: number;
  payerId: MemberId;
  amount: string;
  /** The shared column it's logged into. */
  columnId: number;
}

/** A shared-advances column ("Advances Shared", "w/o PA", "Ice Maker Adj."). */
export interface SettlementColumn {
  id: number;
  name: string;
  splitMode: "equal" | "manual";
  /** equal: who's `included`; manual: each member's typed `amount` (missing = 0). */
  members: { memberId: MemberId; included: boolean; amount: string | null }[];
}

export interface SettlementPayment {
  fromMemberId: MemberId;
  toMemberId: MemberId;
  amount: string;
}

export interface MonthInput {
  /** The period's members (rows in period_balances), not whoever is active today. */
  members: SettlementMember[];
  bills: SettlementBill[];
  /** Keyed by bill id. Every confirmed bill needs shares that sum to its total. */
  billShares: Map<number, SettlementShare[]>;
  sharedColumns: SettlementColumn[];
  advances: SettlementAdvance[];
  payments: SettlementPayment[];
  /** Opening balance per member (what carried over from last month). Missing = 0. */
  openingBalances: Map<MemberId, Centavos>;
}

export interface ColumnResult {
  id: number;
  name: string;
  splitMode: "equal" | "manual";
  /** Sum of the advances logged into the column. */
  total: Centavos;
  /** Manual columns: typed amounts − total (positive = over, negative = short). 0 for equal. */
  difference: Centavos;
  /** Equal columns: who shares it. */
  includedIds: MemberId[];
}

export interface MemberMonth {
  member: SettlementMember;
  /** Keyed by bill id. */
  billShares: Map<number, Centavos>;
  /** Keyed by shared column id. */
  columnShares: Map<number, Centavos>;
  /** Bill shares + shared column shares ("Total" in the sheet). */
  total: Centavos;
  /** Advances this member paid for. */
  ownAdvances: Centavos;
  /** Bills this member paid to the provider. */
  billsPaid: Centavos;
  /** total − ownAdvances − billsPaid ("Month Final"). */
  monthFinal: Centavos;
  /** Carried over from last month ("Prev Month Unsettled"). */
  opening: Centavos;
  paidOut: Centavos;
  received: Centavos;
  /** opening + monthFinal − paidOut + received ("Final"); carries into next month. */
  balance: Centavos;
}

export interface MonthResult {
  rows: MemberMonth[];
  columns: ColumnResult[];
}

export class SettlementError extends Error {}

/**
 * The order to hand out leftover centavos when splitting: the collector first, then
 * everyone else by sort order. The collector absorbs the rounding so it never lands on
 * the other members.
 */
export function splitOrder(members: readonly SettlementMember[]): MemberId[] {
  return [...members]
    .sort((a, b) => Number(b.isCollector) - Number(a.isCollector) || a.sortOrder - b.sortOrder || a.id - b.id)
    .map((m) => m.id);
}

/**
 * The one place bill shares are computed (used by Server Actions, seeds and tests).
 * - equal:  total split equally, leftovers in `order`
 * - points: total split by points (e.g. Meralco 2.5 / 1.8 / 1.5 / 1.5 / 1)
 * - manual: the given shares as-is; the bill total is their sum
 */
export function computeBillShares(
  mode: SplitMode,
  total: Centavos,
  order: readonly MemberId[],
  options: { points?: ReadonlyMap<MemberId, number>; manual?: ReadonlyMap<MemberId, Centavos> } = {},
): Map<MemberId, Centavos> {
  if (order.length === 0) throw new SettlementError("A bill needs at least one member to split between");
  switch (mode) {
    case "equal":
      return splitEqually(total, order);
    case "points": {
      const weights = order.map((id) => [id, options.points?.get(id) ?? 0] as const);
      if (weights.some(([, w]) => !Number.isFinite(w) || w < 0)) {
        throw new SettlementError("Points can't be negative");
      }
      if (weights.every(([, w]) => w === 0)) {
        throw new SettlementError("Give at least one person some points");
      }
      // Points have 2 decimals (numeric(5,2)); split in whole hundredths so the math is exact.
      return splitByWeights(
        total,
        weights.map(([id, w]) => [id, Math.round(w * 100)] as const),
      );
    }
    case "manual":
      return new Map(order.map((id) => [id, options.manual?.get(id) ?? 0]));
  }
}

export function computeMonth(input: MonthInput): MonthResult {
  const members = [...input.members].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const memberSet = new Set(members.map((m) => m.id));
  const order = splitOrder(members);
  if (members.filter((m) => m.isCollector).length > 1) {
    throw new SettlementError("Only one member can be the collector");
  }

  const assertMember = (id: MemberId, context: string) => {
    if (!memberSet.has(id)) throw new SettlementError(`${context}: member ${id} isn't in this month`);
  };

  const rows = new Map<MemberId, MemberMonth>(
    members.map((member) => [
      member.id,
      {
        member,
        billShares: new Map(),
        columnShares: new Map(),
        total: 0,
        ownAdvances: 0,
        billsPaid: 0,
        monthFinal: 0,
        opening: 0,
        paidOut: 0,
        received: 0,
        balance: 0,
      },
    ]),
  );
  const row = (id: MemberId) => rows.get(id)!;

  // --- Bills: materialized shares; pending (unconfirmed email) bills are ignored ---
  for (const bill of input.bills) {
    if (bill.status !== "confirmed") continue;
    assertMember(bill.paidById, `Bill "${bill.name}" paid by`);
    const total = toCentavos(bill.totalAmount);
    const shares = input.billShares.get(bill.id) ?? [];
    assertSharesSumTo(shares, total, `Shares for ${bill.name}`, assertMember);
    for (const share of shares) {
      const amount = toCentavos(share.amount);
      row(share.memberId).billShares.set(bill.id, amount);
      row(share.memberId).total += amount;
    }
    // Full ledger: whoever paid the provider (usually the collector) is credited in full.
    row(bill.paidById).billsPaid += total;
  }

  // --- Advances: each is logged into a shared column; a column's total is the sum of its
  //     advances, split equally among who's included, or by the typed manual amounts ---
  const columnTotals = new Map<number, Centavos>(input.sharedColumns.map((c) => [c.id, 0]));
  for (const advance of input.advances) {
    assertMember(advance.payerId, `Advance ${advance.id} payer`);
    if (!columnTotals.has(advance.columnId)) {
      throw new SettlementError(`Advance ${advance.id} is in a column that isn't in this month`);
    }
    const amount = toCentavos(advance.amount);
    row(advance.payerId).ownAdvances += amount;
    columnTotals.set(advance.columnId, columnTotals.get(advance.columnId)! + amount);
  }

  const columns: ColumnResult[] = [];
  for (const column of input.sharedColumns) {
    const total = columnTotals.get(column.id)!;
    for (const m of column.members) assertMember(m.memberId, `Column "${column.name}"`);
    const includedIds = order.filter((id) => column.members.some((m) => m.memberId === id && m.included));
    let shares: Map<MemberId, Centavos>;
    let difference = 0;
    if (column.splitMode === "manual") {
      // Everyone in the month gets a manual amount; nothing typed yet counts as ₱0.
      const typed = new Map(column.members.map((m) => [m.memberId, m.amount === null ? 0 : toCentavos(m.amount)]));
      shares = new Map(order.map((id) => [id, typed.get(id) ?? 0]));
      difference = sumCentavos(shares.values()) - total;
    } else if (total === 0) {
      shares = new Map();
    } else {
      if (includedIds.length === 0) throw new SettlementError(`Nobody shares "${column.name}"`);
      shares = splitEqually(total, includedIds);
    }
    for (const [id, share] of shares) {
      row(id).columnShares.set(column.id, share);
      row(id).total += share;
    }
    columns.push({ id: column.id, name: column.name, splitMode: column.splitMode, total, difference, includedIds });
  }

  // --- Payments ---
  for (const payment of input.payments) {
    assertMember(payment.fromMemberId, "Payment from");
    assertMember(payment.toMemberId, "Payment to");
    const amount = toCentavos(payment.amount);
    row(payment.fromMemberId).paidOut += amount;
    row(payment.toMemberId).received += amount;
  }

  // --- Totals and carry-over (the same formula for everyone, collector included) ---
  for (const r of rows.values()) {
    r.monthFinal = r.total - r.ownAdvances - r.billsPaid;
    r.opening = input.openingBalances.get(r.member.id) ?? 0;
    r.balance = r.opening + r.monthFinal - r.paidOut + r.received;
  }

  return { rows: members.map((m) => row(m.id)), columns };
}

/** Each member's Final this month = their opening balance next month. */
export function openingBalancesFrom(result: MonthResult): Map<MemberId, Centavos> {
  return new Map(result.rows.map((r) => [r.member.id, r.balance]));
}

function assertSharesSumTo(
  shares: SettlementShare[],
  expected: Centavos,
  context: string,
  assertMember: (id: MemberId, context: string) => void,
) {
  for (const share of shares) assertMember(share.memberId, context);
  const actual = sumCentavos(shares.map((s) => toCentavos(s.amount)));
  if (actual !== expected) {
    throw new SettlementError(
      `${context} add up to ₱${(actual / 100).toFixed(2)}, but the total is ₱${(expected / 100).toFixed(2)}`,
    );
  }
}
