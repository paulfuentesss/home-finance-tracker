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
  /** Members sharing an equal-split advance. null = everyone in the period. */
  sharedWith: MemberId[] | null;
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
  advances: SettlementAdvance[];
  /** Keyed by advance id. Only custom-split advances appear here. */
  advanceShares: Map<number, SettlementShare[]>;
  payments: SettlementPayment[];
  /** Opening balance per member (what carried over from last month). Missing = 0. */
  openingBalances: Map<MemberId, Centavos>;
}

/** Equal-split advances shared by the same set of members, split once as a pool. */
export interface AdvancePool {
  /** "all" or the sorted member ids joined by "-". */
  key: string;
  memberIds: MemberId[];
  total: Centavos;
}

export interface MemberMonth {
  member: SettlementMember;
  /** Keyed by bill id. */
  billShares: Map<number, Centavos>;
  /** Keyed by pool key. */
  poolShares: Map<string, Centavos>;
  /** Keyed by advance id (custom-split advances, e.g. the Ice Maker). */
  customShares: Map<number, Centavos>;
  /** Bill shares + pool shares + custom shares ("Total" in the sheet). */
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
  pools: AdvancePool[];
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
      return splitByWeights(total, weights);
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
        poolShares: new Map(),
        customShares: new Map(),
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

  // --- Advances: custom-split ones use their own shares; equal-split ones are pooled by
  //     who shares them and each pool is split once (like the sheet's "w PA" / "w/o PA") ---
  const pools = new Map<string, AdvancePool>();
  for (const advance of input.advances) {
    assertMember(advance.payerId, `Advance ${advance.id} payer`);
    const amount = toCentavos(advance.amount);
    row(advance.payerId).ownAdvances += amount;

    const custom = input.advanceShares.get(advance.id);
    if (custom && custom.length > 0) {
      assertSharesSumTo(custom, amount, `Custom split for advance ${advance.id}`, assertMember);
      for (const share of custom) {
        const value = toCentavos(share.amount);
        row(share.memberId).customShares.set(advance.id, value);
        row(share.memberId).total += value;
      }
      continue;
    }

    const pool = poolFor(advance, order, assertMember);
    const existing = pools.get(pool.key);
    if (existing) existing.total += amount;
    else pools.set(pool.key, { ...pool, total: amount });
  }
  for (const pool of pools.values()) {
    // Keep the collector-first leftover order within the pool.
    const poolOrder = order.filter((id) => pool.memberIds.includes(id));
    for (const [id, share] of splitEqually(pool.total, poolOrder)) {
      row(id).poolShares.set(pool.key, share);
      row(id).total += share;
    }
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

  return {
    rows: members.map((m) => row(m.id)),
    // "all" first, then the others in a stable order.
    pools: [...pools.values()].sort((a, b) => (a.key === "all" ? -1 : b.key === "all" ? 1 : a.key.localeCompare(b.key))),
  };
}

/** Each member's Final this month = their opening balance next month. */
export function openingBalancesFrom(result: MonthResult): Map<MemberId, Centavos> {
  return new Map(result.rows.map((r) => [r.member.id, r.balance]));
}

/**
 * Normalizes an advance's `shared_with` list: null (or a list covering everyone) means
 * everyone; otherwise it must be a non-empty subset of the month's members.
 */
export function normalizeSharedWith(
  sharedWith: readonly MemberId[] | null,
  periodMemberIds: readonly MemberId[],
): MemberId[] | null {
  if (!sharedWith) return null;
  const unique = [...new Set(sharedWith)].sort((a, b) => a - b);
  if (unique.length === 0) throw new SettlementError("Choose at least one person to share this with");
  const inPeriod = new Set(periodMemberIds);
  if (unique.some((id) => !inPeriod.has(id))) throw new SettlementError("Someone in this split isn't in this month");
  return unique.length === inPeriod.size ? null : unique;
}

/** Column label for a pool: "Adv shared (all)" or "Adv shared (w/o PA, PJ)". */
export function poolLabel(pool: Pick<AdvancePool, "memberIds">, members: readonly SettlementMember[]): string {
  const excluded = members.filter((m) => !pool.memberIds.includes(m.id)).map((m) => m.name);
  return excluded.length === 0 ? "Adv shared (all)" : `Adv shared (w/o ${excluded.join(", ")})`;
}

function poolFor(
  advance: SettlementAdvance,
  order: readonly MemberId[],
  assertMember: (id: MemberId, context: string) => void,
): Omit<AdvancePool, "total"> {
  if (!advance.sharedWith) return { key: "all", memberIds: [...order] };
  for (const id of advance.sharedWith) assertMember(id, `Advance ${advance.id} shared with`);
  const ids = [...new Set(advance.sharedWith)].sort((a, b) => a - b);
  if (ids.length === 0) throw new SettlementError(`Advance ${advance.id} isn't shared with anyone`);
  if (ids.length === order.length) return { key: "all", memberIds: [...order] };
  return { key: ids.join("-"), memberIds: ids };
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
