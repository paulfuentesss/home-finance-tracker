import { describe, expect, it } from "vitest";
import {
  AUGUST_2026,
  HOUSEHOLD_MEMBERS,
  SHEET_MONTH_FINALS,
  type MemberName,
} from "@/lib/__fixtures__/august-2026";
import { fromCentavos, sumCentavos, toCentavos, type Centavos } from "@/lib/money";
import {
  computeBillShares,
  computeMonth,
  normalizeSharedWith,
  openingBalancesFrom,
  poolLabel,
  SettlementError,
  splitOrder,
  type MonthInput,
  type SettlementMember,
  type SettlementShare,
} from "@/lib/settlement";

const members: SettlementMember[] = HOUSEHOLD_MEMBERS.map((m, i) => ({ id: i + 1, ...m }));
const idOf = (name: MemberName) => members.find((m) => m.name === name)!.id;
const order = splitOrder(members);
const byName = <T,>(record: Partial<Record<MemberName, T>>) =>
  new Map(Object.entries(record).map(([name, v]) => [idOf(name as MemberName), v as T]));
const asShares = (shares: Map<number, Centavos>): SettlementShare[] =>
  [...shares].map(([memberId, c]) => ({ memberId, amount: fromCentavos(c) }));

/** Builds August 2026 the same way seed-august does, via computeBillShares. */
function augustInput(): MonthInput {
  const bills = AUGUST_2026.bills.map((b, i) => ({
    id: i + 1,
    name: b.name,
    totalAmount: b.totalAmount,
    paidById: idOf(b.paidBy),
    status: "confirmed" as const,
  }));
  const billShares = new Map(
    AUGUST_2026.bills.map((b, i) => [
      i + 1,
      asShares(computeBillShares(b.splitMode, toCentavos(b.totalAmount), order, { points: byName(b.points ?? {}) })),
    ]),
  );
  const advances = AUGUST_2026.advances.map((a, i) => ({
    id: i + 1,
    payerId: idOf(a.payer),
    amount: a.amount,
    sharedWith: a.sharedWith ? a.sharedWith.map(idOf) : null,
  }));
  const advanceShares = new Map<number, SettlementShare[]>();
  AUGUST_2026.advances.forEach((a, i) => {
    if (!a.customWeights) return;
    const shares = computeBillShares("points", toCentavos(a.amount), order, { points: byName(a.customWeights) });
    advanceShares.set(i + 1, asShares(shares));
  });
  return { members, bills, billShares, advances, advanceShares, payments: [], openingBalances: new Map() };
}

const rowOf = (result: ReturnType<typeof computeMonth>, name: MemberName) =>
  result.rows.find((r) => r.member.name === name)!;

describe("August 2026 — reproduces the household sheet", () => {
  const result = computeMonth(augustInput());

  it("matches the hand-computed values exactly", () => {
    const expected: Record<MemberName, { total: string; own: string; final: string }> = {
      "Ate Toni": { total: "24156.54", own: "5732.00", final: "18424.54" },
      Mayee: { total: "20883.09", own: "8785.00", final: "12098.09" },
      Skyler: { total: "20883.06", own: "37851.00", final: "-16967.94" },
      PJ: { total: "19951.52", own: "13636.40", final: "6315.12" },
      PA: { total: "11519.91", own: "31389.72", final: "-19869.81" },
    };
    for (const [name, e] of Object.entries(expected) as [MemberName, (typeof expected)[MemberName]][]) {
      const r = rowOf(result, name);
      expect(fromCentavos(r.total), name).toBe(e.total);
      expect(fromCentavos(r.ownAdvances + r.billsPaid), name).toBe(e.own);
      expect(fromCentavos(r.monthFinal), name).toBe(e.final);
    }
  });

  it("is within ₱0.02 of the sheet (which rounds each share on its own)", () => {
    for (const r of result.rows) {
      const sheet = toCentavos(SHEET_MONTH_FINALS[r.member.name as MemberName]);
      expect(Math.abs(r.monthFinal - sheet), r.member.name).toBeLessThanOrEqual(2);
    }
  });

  it("everyone's Month Final sums to exactly ₱0.00 (full ledger)", () => {
    expect(sumCentavos(result.rows.map((r) => r.monthFinal))).toBe(0);
  });

  // Exact points shares are 4,657.708 / 2,794.625 / 2,794.625 / 1,863.083 / 3,353.550. The 3
  // leftover centavos go to the largest remainders (ties: collector first, then sort order),
  // so Mayee gets the centavo the sheet drops (its Meralco shares sum to ₱0.01 short).
  it("splits Meralco by points (8.3) like the sheet", () => {
    const meralco = (name: MemberName) => fromCentavos(rowOf(result, name).billShares.get(1)!);
    expect((["Ate Toni", "Mayee", "Skyler", "PJ", "PA"] as const).map(meralco)).toEqual([
      "4657.71",
      "2794.63",
      "2794.62",
      "1863.08",
      "3353.55",
    ]);
  });

  it("has a 'w PA' and a 'w/o PA' pool, each split once", () => {
    const [all, withoutPa] = result.pools;
    expect(all.key).toBe("all");
    expect(fromCentavos(all.total)).toBe("27208.50");
    expect(fromCentavos(withoutPa.total)).toBe("39688.40");
    expect(poolLabel(withoutPa, members)).toBe("Adv shared (w/o PA)");
    for (const name of ["Ate Toni", "Mayee", "Skyler", "PJ"] as const) {
      expect(rowOf(result, name).poolShares.get(all.key)).toBe(544170);
      expect(rowOf(result, name).poolShares.get(withoutPa.key)).toBe(992210);
    }
    expect(rowOf(result, "PA").poolShares.get(withoutPa.key)).toBeUndefined();
  });

  it("splits the Ice Maker 50% Ate Toni / 12.5% others", () => {
    const iceMaker = AUGUST_2026.advances.findIndex((a) => a.description === "Ice Maker") + 1;
    expect(rowOf(result, "Ate Toni").customShares.get(iceMaker)).toBe(188050);
    const others = (["Mayee", "Skyler", "PJ", "PA"] as const).map((n) => rowOf(result, n).customShares.get(iceMaker)!);
    expect(sumCentavos(others)).toBe(188050);
    expect(others.every((c) => c === 47012 || c === 47013)).toBe(true);
  });

  it("credits PA for the bills he paid", () => {
    expect(fromCentavos(rowOf(result, "PA").billsPaid)).toBe("26736.22");
  });
});

describe("computeBillShares", () => {
  it("equal: leftover centavos go to the collector first", () => {
    const shares = computeBillShares("equal", toCentavos("2173.63"), order);
    expect(shares.get(idOf("PA"))).toBe(43473);
    expect(shares.get(idOf("PJ"))).toBe(43472);
    expect(sumCentavos(shares.values())).toBe(217363);
  });

  it("points: rejects negative or all-zero points", () => {
    expect(() => computeBillShares("points", 1000, order, { points: byName({ PA: -1, PJ: 2 }) })).toThrow(
      SettlementError,
    );
    expect(() => computeBillShares("points", 1000, order, { points: new Map() })).toThrow(SettlementError);
  });

  it("points: a member with 0 points pays nothing", () => {
    const shares = computeBillShares("points", 10000, order, { points: byName({ PA: 1, PJ: 1 }) });
    expect(shares.get(idOf("Mayee"))).toBe(0);
    expect(sumCentavos(shares.values())).toBe(10000);
  });

  it("manual: shares as given (the bill total is their sum)", () => {
    const shares = computeBillShares("manual", 0, order, { manual: byName({ PA: 500, Mayee: 250 }) });
    expect(sumCentavos(shares.values())).toBe(750);
    expect(shares.get(idOf("PJ"))).toBe(0);
  });
});

describe("computeMonth — rules", () => {
  function helperOnly(paidBy: MemberName): MonthInput {
    const total = toCentavos("6400.00");
    return {
      members,
      bills: [{ id: 1, name: "Helper", totalAmount: fromCentavos(total), paidById: idOf(paidBy), status: "confirmed" }],
      billShares: new Map([[1, asShares(computeBillShares("equal", total, order))]]),
      advances: [],
      advanceShares: new Map(),
      payments: [],
      openingBalances: new Map(),
    };
  }

  it("credits whoever paid the bill, collector or not", () => {
    for (const payer of ["PA", "Skyler"] as const) {
      const result = computeMonth(helperOnly(payer));
      expect(rowOf(result, payer).monthFinal).toBe(128000 - 640000);
      expect(rowOf(result, "Mayee").monthFinal).toBe(128000);
      expect(sumCentavos(result.rows.map((r) => r.monthFinal))).toBe(0);
    }
  });

  it("ignores pending (unconfirmed email) bills", () => {
    const input = helperOnly("PA");
    input.bills[0].status = "pending";
    input.billShares = new Map();
    expect(computeMonth(input).rows.every((r) => r.monthFinal === 0)).toBe(true);
  });

  it("carry-over uses one formula for everyone: opening + final − paid out + received", () => {
    const input = helperOnly("PA");
    input.openingBalances = byName({ Mayee: 50000, PA: -50000 });
    input.payments = [{ fromMemberId: idOf("Mayee"), toMemberId: idOf("PA"), amount: "1780.00" }];
    const result = computeMonth(input);
    expect(rowOf(result, "Mayee").balance).toBe(50000 + 128000 - 178000);
    expect(rowOf(result, "PA").balance).toBe(-50000 + (128000 - 640000) + 178000);
  });

  it("chains live: this month's Final is next month's opening", () => {
    const august = computeMonth(augustInput());
    const september = computeMonth({ ...helperOnly("PA"), openingBalances: openingBalancesFrom(august) });
    expect(rowOf(september, "Skyler").opening).toBe(rowOf(august, "Skyler").balance);
    expect(rowOf(september, "Skyler").balance).toBe(
      rowOf(august, "Skyler").balance + rowOf(september, "Skyler").monthFinal,
    );
  });

  it("reports shares that don't add up", () => {
    const input = helperOnly("PA");
    input.billShares.get(1)![0].amount = "0.00";
    expect(() => computeMonth(input)).toThrow(/add up to/);
  });

  it("rejects people who aren't in the month", () => {
    const input = helperOnly("PA");
    input.advances = [{ id: 1, payerId: 999, amount: "10.00", sharedWith: null }];
    expect(() => computeMonth(input)).toThrow(SettlementError);
    input.advances = [{ id: 1, payerId: idOf("PA"), amount: "10.00", sharedWith: [999] }];
    expect(() => computeMonth(input)).toThrow(SettlementError);
  });
});

describe("advance sharing", () => {
  const ids = members.map((m) => m.id);

  it("normalizeSharedWith: everyone → null, subset → sorted ids", () => {
    expect(normalizeSharedWith(null, ids)).toBeNull();
    expect(normalizeSharedWith([...ids].reverse(), ids)).toBeNull();
    expect(normalizeSharedWith([idOf("PJ"), idOf("Mayee")], ids)).toEqual([idOf("Mayee"), idOf("PJ")]);
  });

  it("normalizeSharedWith: rejects empty or outside ids", () => {
    expect(() => normalizeSharedWith([], ids)).toThrow(SettlementError);
    expect(() => normalizeSharedWith([999], ids)).toThrow(SettlementError);
  });

  it("poolLabel names who's left out", () => {
    expect(poolLabel({ memberIds: ids }, members)).toBe("Adv shared (all)");
    expect(poolLabel({ memberIds: [idOf("Mayee"), idOf("Skyler"), idOf("Ate Toni")] }, members)).toBe(
      "Adv shared (w/o PJ, PA)",
    );
  });
});

describe("splitOrder", () => {
  it("puts the collector first so they absorb leftover centavos", () => {
    expect(order.map((id) => members.find((m) => m.id === id)!.name)).toEqual([
      "PA",
      "Ate Toni",
      "Mayee",
      "Skyler",
      "PJ",
    ]);
  });
});
