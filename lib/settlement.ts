// Monthly settlement math. Pure functions only (no DB access) so it's easy to test and
// reuse from Server Components. The rules are explained in docs/settlement-rules.md.
//
// Sign convention (same as the Google Sheet / App.jsx prototype):
//   positive balance = member owes the collector, negative = member is owed.

import { splitEqually, sumCentavos, toCentavos, type Centavos } from "@/lib/money";

export type MemberId = number;

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
  /** Opening balance per member (the previous month's closing balance). Missing = 0. */
  openingBalances: Map<MemberId, string>;
}

export interface MemberMonth {
  member: SettlementMember;
  billShares: Map<number, Centavos>;
  billSharesTotal: Centavos;
  advanceShare: Centavos;
  ownAdvances: Centavos;
  /** Adjustment when someone other than the collector paid a bill provider. */
  billPayerCredit: Centavos;
  /** billSharesTotal + advanceShare − ownAdvances + billPayerCredit ("Month Final" in the sheet). */
  monthFinal: Centavos;
  opening: Centavos;
  paidOut: Centavos;
  received: Centavos;
  /** What carries into next month. Always 0 for the collector. */
  balance: Centavos;
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

export function computeMonth(input: MonthInput): MemberMonth[] {
  const members = [...input.members].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const memberIds = members.map((m) => m.id);
  const memberSet = new Set(memberIds);
  const collectors = members.filter((m) => m.isCollector);
  if (collectors.length !== 1) {
    throw new SettlementError(`Expected exactly one collector, found ${collectors.length}`);
  }
  const collectorId = collectors[0].id;

  const assertMember = (id: MemberId, context: string) => {
    if (!memberSet.has(id)) throw new SettlementError(`${context}: member ${id} is not in this period`);
  };

  const rows = new Map<MemberId, MemberMonth>(
    members.map((member) => [
      member.id,
      {
        member,
        billShares: new Map(),
        billSharesTotal: 0,
        advanceShare: 0,
        ownAdvances: 0,
        billPayerCredit: 0,
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
    assertMember(bill.paidById, `Bill "${bill.name}" paid_by`);
    const total = toCentavos(bill.totalAmount);
    const shares = input.billShares.get(bill.id) ?? [];
    assertSharesSumTo(shares, total, `Bill "${bill.name}"`, assertMember);
    for (const share of shares) {
      const amount = toCentavos(share.amount);
      row(share.memberId).billShares.set(bill.id, amount);
      row(share.memberId).billSharesTotal += amount;
    }
    // Collector model: everyone settles with the collector. If someone else paid this
    // provider, they're owed the full total and the collector owes it instead.
    if (bill.paidById !== collectorId) {
      row(bill.paidById).billPayerCredit -= total;
      row(collectorId).billPayerCredit += total;
    }
  }

  // --- Advances: equal-split ones are pooled and split once (like the prototype's
  //     totalSharedAdvances / 5); custom-split ones use their own share rows ---
  let pooled: Centavos = 0;
  for (const advance of input.advances) {
    assertMember(advance.payerId, `Advance ${advance.id} payer`);
    const amount = toCentavos(advance.amount);
    row(advance.payerId).ownAdvances += amount;

    const custom = input.advanceShares.get(advance.id);
    if (custom && custom.length > 0) {
      assertSharesSumTo(custom, amount, `Advance ${advance.id}`, assertMember);
      for (const share of custom) row(share.memberId).advanceShare += toCentavos(share.amount);
    } else {
      pooled += amount;
    }
  }
  if (pooled > 0) {
    for (const [id, share] of splitEqually(pooled, splitOrder(members))) row(id).advanceShare += share;
  }

  // --- Payments ---
  for (const payment of input.payments) {
    assertMember(payment.fromMemberId, "Payment from");
    assertMember(payment.toMemberId, "Payment to");
    const amount = toCentavos(payment.amount);
    row(payment.fromMemberId).paidOut += amount;
    row(payment.toMemberId).received += amount;
  }

  // --- Totals and carry-over ---
  for (const r of rows.values()) {
    r.monthFinal = r.billSharesTotal + r.advanceShare - r.ownAdvances + r.billPayerCredit;
    r.opening = toCentavos(input.openingBalances.get(r.member.id) ?? "0");
    // The collector's Month Final is their own fair share, which they've already paid
    // by fronting the bills — so nothing carries over for them.
    r.balance = r.member.isCollector ? 0 : r.opening + r.monthFinal - r.paidOut + r.received;
  }

  return members.map((m) => row(m.id));
}

/**
 * Re-split a bill after its total changes: overridden shares stay as they are and the
 * remainder is split equally among everyone else (in the given order).
 */
export function resplitBill(
  total: Centavos,
  memberIds: readonly MemberId[],
  overrides: ReadonlyMap<MemberId, Centavos>,
): Map<MemberId, Centavos> {
  const overrideTotal = sumCentavos(overrides.values());
  const remaining = total - overrideTotal;
  if (remaining < 0) {
    throw new SettlementError("Overridden shares exceed the bill total");
  }
  const rest = memberIds.filter((id) => !overrides.has(id));
  if (rest.length === 0) {
    if (remaining !== 0) throw new SettlementError("Overrides must sum to the total when every share is overridden");
    return new Map(overrides);
  }
  const split = splitEqually(remaining, rest);
  return new Map(memberIds.map((id) => [id, overrides.get(id) ?? split.get(id)!]));
}

function assertSharesSumTo(
  shares: SettlementShare[],
  expected: Centavos,
  context: string,
  assertMember: (id: MemberId, context: string) => void,
) {
  for (const share of shares) assertMember(share.memberId, `${context} share`);
  const actual = sumCentavos(shares.map((s) => toCentavos(s.amount)));
  if (actual !== expected) {
    throw new SettlementError(`${context}: shares sum to ${actual} centavos, expected ${expected}`);
  }
}
