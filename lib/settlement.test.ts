import { describe, expect, it } from "vitest";
import { AUGUST_2026, HOUSEHOLD_MEMBERS, type MemberName } from "@/lib/__fixtures__/august-2026";
import { fromCentavos, splitByWeights, splitEqually, sumCentavos, toCentavos } from "@/lib/money";
import {
  computeMonth,
  resplitBill,
  SettlementError,
  type MonthInput,
  type SettlementMember,
  type SettlementShare,
} from "@/lib/settlement";

const members: SettlementMember[] = HOUSEHOLD_MEMBERS.map((m, i) => ({ id: i + 1, ...m }));
const idOf = (name: MemberName) => members.find((m) => m.name === name)!.id;
const memberIds = members.map((m) => m.id);

/** Build the August 2026 month the same way the app will: materialized equal bill shares. */
function augustInput({ customIceMaker }: { customIceMaker: boolean }): MonthInput {
  const bills = AUGUST_2026.bills.map((b, i) => ({
    id: i + 1,
    name: b.name,
    totalAmount: b.totalAmount,
    paidById: idOf(b.paidBy),
    status: "confirmed" as const,
  }));
  const billShares = new Map<number, SettlementShare[]>(
    bills.map((b) => [
      b.id,
      [...splitEqually(toCentavos(b.totalAmount), memberIds)].map(([memberId, c]) => ({
        memberId,
        amount: fromCentavos(c),
      })),
    ]),
  );

  const advances = AUGUST_2026.advances.map((a, i) => ({ id: i + 1, payerId: idOf(a.payer), amount: a.amount }));
  const advanceShares = new Map<number, SettlementShare[]>();
  if (customIceMaker) {
    AUGUST_2026.advances.forEach((a, i) => {
      if (!("customWeights" in a)) return;
      const weights = Object.entries(a.customWeights).map(([name, w]) => [idOf(name as MemberName), w] as const);
      const split = splitByWeights(toCentavos(a.amount), weights);
      advanceShares.set(
        i + 1,
        [...split].map(([memberId, c]) => ({ memberId, amount: fromCentavos(c) })),
      );
    });
  }

  return { members, bills, billShares, advances, advanceShares, payments: [], openingBalances: new Map() };
}

/** The App.jsx formula, float math and all, for comparison. */
function prototypeMonthFinal(name: MemberName): number {
  const n = HOUSEHOLD_MEMBERS.length;
  const billTotal = AUGUST_2026.bills.reduce((s, b) => s + Number((Number(b.totalAmount) / n).toFixed(2)), 0);
  const allAdvances = AUGUST_2026.advances.reduce((s, a) => s + Number(a.amount), 0);
  const own = AUGUST_2026.advances.filter((a) => a.payer === name).reduce((s, a) => s + Number(a.amount), 0);
  return billTotal + allAdvances / n - own;
}

describe("computeMonth — August 2026 fixture", () => {
  it("matches the prototype's Month Final to within the centavo rounding fixes", () => {
    const result = computeMonth(augustInput({ customIceMaker: false }));
    for (const r of result) {
      const expected = Math.round(prototypeMonthFinal(r.member.name as MemberName) * 100);
      // Up to 1 centavo per bill (4 bills) + 1 from the pooled advance split.
      expect(Math.abs(r.monthFinal - expected)).toBeLessThanOrEqual(5);
    }
  });

  it("everyone's Month Final sums exactly to the bills the collector fronted", () => {
    const result = computeMonth(augustInput({ customIceMaker: true }));
    const bills = sumCentavos(AUGUST_2026.bills.map((b) => toCentavos(b.totalAmount)));
    expect(sumCentavos(result.map((r) => r.monthFinal))).toBe(bills);
  });

  it("applies the Ice Maker custom split (PA 50%, others 12.5%) instead of 20% each", () => {
    const equal = computeMonth(augustInput({ customIceMaker: false }));
    const custom = computeMonth(augustInput({ customIceMaker: true }));
    const delta = (name: MemberName) =>
      custom.find((r) => r.member.name === name)!.advanceShare - equal.find((r) => r.member.name === name)!.advanceShare;

    // PA: 1,880.50 instead of 752.20.
    expect(delta("PA")).toBe(188050 - 75220);
    // Everyone else: ~470.13 instead of 752.20, so ~282.07 less.
    for (const name of ["Ate Tonette", "Mayee", "KP", "PJ"] as const) {
      expect(delta(name)).toBeGreaterThanOrEqual(-28209);
      expect(delta(name)).toBeLessThanOrEqual(-28206);
    }
    expect(sumCentavos(custom.map((r) => r.advanceShare))).toBe(
      sumCentavos(AUGUST_2026.advances.map((a) => toCentavos(a.amount))),
    );
  });

  it("carries non-collector balances forward and keeps the collector at 0", () => {
    const result = computeMonth(augustInput({ customIceMaker: true }));
    for (const r of result) {
      expect(r.balance).toBe(r.member.isCollector ? 0 : r.monthFinal);
    }
  });
});

describe("computeMonth — rules", () => {
  const collector = idOf("PA");
  const kp = idOf("KP");
  const mayee = idOf("Mayee");

  function helperOnly(paidById: number): MonthInput {
    const total = "6400.00";
    return {
      members,
      bills: [{ id: 1, name: "Helper", totalAmount: total, paidById, status: "confirmed" }],
      billShares: new Map([
        [1, [...splitEqually(toCentavos(total), memberIds)].map(([memberId, c]) => ({ memberId, amount: fromCentavos(c) }))],
      ]),
      advances: [],
      advanceShares: new Map(),
      payments: [],
      openingBalances: new Map(),
    };
  }

  it("credits a non-collector who paid a bill and debits the collector", () => {
    const result = computeMonth(helperOnly(kp));
    const row = (id: number) => result.find((r) => r.member.id === id)!;
    expect(row(kp).billPayerCredit).toBe(-640000);
    expect(row(collector).billPayerCredit).toBe(640000);
    // KP's share is 1,280, but they fronted 6,400 → owed 5,120.
    expect(row(kp).monthFinal).toBe(128000 - 640000);
    expect(row(mayee).monthFinal).toBe(128000);
  });

  it("does nothing extra when the collector paid", () => {
    const result = computeMonth(helperOnly(collector));
    expect(result.every((r) => r.billPayerCredit === 0)).toBe(true);
  });

  it("ignores pending (unconfirmed email) bills", () => {
    const input = helperOnly(collector);
    input.bills[0].status = "pending";
    input.billShares = new Map();
    expect(computeMonth(input).every((r) => r.monthFinal === 0)).toBe(true);
  });

  it("carries over: opening + monthFinal − paid out + received", () => {
    const input = helperOnly(collector);
    input.openingBalances = new Map([
      [mayee, "500.00"],
      [collector, "999.00"], // ignored — the collector never carries a balance
    ]);
    input.payments = [
      { fromMemberId: mayee, toMemberId: collector, amount: "1000.00" },
      { fromMemberId: collector, toMemberId: kp, amount: "200.00" },
    ];
    const result = computeMonth(input);
    const row = (id: number) => result.find((r) => r.member.id === id)!;
    expect(row(mayee).balance).toBe(50000 + 128000 - 100000);
    expect(row(kp).balance).toBe(128000 + 20000);
    expect(row(collector).balance).toBe(0);
  });

  it("rejects shares that don't sum to the bill total", () => {
    const input = helperOnly(collector);
    input.billShares.get(1)![0].amount = "0.00";
    expect(() => computeMonth(input)).toThrow(SettlementError);
  });

  it("rejects members outside the period", () => {
    const input = helperOnly(collector);
    input.advances = [{ id: 1, payerId: 999, amount: "10.00" }];
    expect(() => computeMonth(input)).toThrow(SettlementError);
  });

  it("requires exactly one collector", () => {
    const input = helperOnly(collector);
    input.members = members.map((m) => ({ ...m, isCollector: false }));
    expect(() => computeMonth(input)).toThrow(SettlementError);
  });
});

describe("resplitBill", () => {
  it("keeps overrides and splits the remainder among the rest", () => {
    const shares = resplitBill(toCentavos("6400.00"), memberIds, new Map([[idOf("PA"), 0]]));
    expect(shares.get(idOf("PA"))).toBe(0);
    expect([...shares.values()].filter((_, i) => memberIds[i] !== idOf("PA"))).toEqual([160000, 160000, 160000, 160000]);
    expect(sumCentavos(shares.values())).toBe(640000);
  });

  it("rejects overrides larger than the total", () => {
    expect(() => resplitBill(1000, memberIds, new Map([[idOf("PA"), 2000]]))).toThrow(SettlementError);
  });
});
