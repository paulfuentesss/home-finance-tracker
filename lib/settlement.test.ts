import { describe, expect, it } from "vitest";
import {
  AUGUST_2026,
  DEFAULT_COLUMN,
  HOUSEHOLD_MEMBERS,
  SHEET_MONTH_FINALS,
  type MemberName,
} from "@/lib/__fixtures__/august-2026";
import { fromCentavos, sumCentavos, toCentavos, type Centavos } from "@/lib/money";
import {
  computeBillShares,
  computeMonth,
  openingBalancesFrom,
  SettlementError,
  splitOrder,
  suggestedPayments,
  type MonthInput,
  type SettlementColumn,
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
  const sharedColumns: SettlementColumn[] = AUGUST_2026.columns.map((c, i) => ({
    id: i + 1,
    name: c.name,
    splitMode: c.splitMode,
    members: members.map((m) => ({
      memberId: m.id,
      included: c.included ? c.included.includes(m.name as MemberName) : true,
      amount: c.amounts?.[m.name as MemberName] ?? null,
    })),
  }));
  const columnId = (name: string) => sharedColumns.find((c) => c.name === name)!.id;
  const advances = AUGUST_2026.advances.map((a, i) => ({
    id: i + 1,
    payerId: idOf(a.payer),
    amount: a.amount,
    columnId: columnId(a.column ?? DEFAULT_COLUMN),
  }));
  return { members, bills, billShares, sharedColumns, advances, payments: [], openingBalances: new Map() };
}

const rowOf = (result: ReturnType<typeof computeMonth>, name: MemberName) =>
  result.rows.find((r) => r.member.name === name)!;

describe("August 2026 — the worked example", () => {
  const result = computeMonth(augustInput());

  it("matches the hand-computed values exactly", () => {
    const expected: Record<MemberName, { total: string; own: string; final: string }> = {
      Ana: { total: "20333.91", own: "4980.00", final: "15353.91" },
      Ben: { total: "18065.83", own: "7960.00", final: "10105.83" },
      Cara: { total: "18065.81", own: "33125.00", final: "-15059.19" },
      Dan: { total: "17303.16", own: "11940.40", final: "5362.76" },
      PA: { total: "10038.38", own: "25801.67", final: "-15763.29" },
    };
    for (const [name, e] of Object.entries(expected) as [MemberName, (typeof expected)[MemberName]][]) {
      const r = rowOf(result, name);
      expect(fromCentavos(r.total), name).toBe(e.total);
      expect(fromCentavos(r.ownAdvances + r.billsPaid), name).toBe(e.own);
      expect(fromCentavos(r.monthFinal), name).toBe(e.final);
    }
  });

  it("is within ₱0.01 of rounding each share on its own (as a spreadsheet does)", () => {
    for (const r of result.rows) {
      const sheet = toCentavos(SHEET_MONTH_FINALS[r.member.name as MemberName]);
      expect(Math.abs(r.monthFinal - sheet), r.member.name).toBeLessThanOrEqual(1);
    }
  });

  it("Month Finals sum to the manual columns' mismatch (₱0.02 from the Ice Maker)", () => {
    const mismatch = sumCentavos(result.columns.map((c) => c.difference));
    expect(mismatch).toBe(2);
    expect(sumCentavos(result.rows.map((r) => r.monthFinal))).toBe(mismatch);
  });

  // Exact points shares are 3,355.6815 / 2,287.9646 / 2,287.9646 / 1,525.3098 / 3,050.6195. The 3
  // leftover centavos go to the largest remainders — Dan, PA, then the Ben–Cara tie, which goes
  // in split order (collector first, then sort order), so Ben gets it and Cara doesn't.
  it("splits Meralco by points (8.2), breaking the tie in split order", () => {
    const meralco = (name: MemberName) => fromCentavos(rowOf(result, name).billShares.get(1)!);
    expect((["Ana", "Ben", "Cara", "Dan", "PA"] as const).map(meralco)).toEqual([
      "3355.68",
      "2287.97",
      "2287.96",
      "1525.31",
      "3050.62",
    ]);
  });

  it("splits 'Advances Shared' among everyone and 'w/o PA' among four", () => {
    const [all, withoutPa] = result.columns;
    expect(fromCentavos(all.total)).toBe("23590.50");
    expect(fromCentavos(withoutPa.total)).toBe("35160.40");
    for (const name of ["Ana", "Ben", "Cara", "Dan"] as const) {
      expect(rowOf(result, name).columnShares.get(all.id)).toBe(471810);
      expect(rowOf(result, name).columnShares.get(withoutPa.id)).toBe(879010);
    }
    expect(rowOf(result, "PA").columnShares.get(withoutPa.id)).toBeUndefined();
    expect(withoutPa.includedIds).not.toContain(idOf("PA"));
  });

  it("uses the Ice Maker's typed amounts and reports it ₱0.02 over", () => {
    const iceMaker = result.columns.find((c) => c.name === "Ice Maker Adj.")!;
    expect(fromCentavos(iceMaker.total)).toBe("3201.00");
    expect(iceMaker.difference).toBe(2);
    expect(rowOf(result, "Ana").columnShares.get(iceMaker.id)).toBe(160050);
    expect(rowOf(result, "Dan").columnShares.get(iceMaker.id)).toBe(40013);
  });

  it("credits PA for the bills he paid", () => {
    expect(fromCentavos(rowOf(result, "PA").billsPaid)).toBe("21855.17");
  });
});

describe("computeBillShares", () => {
  it("equal: leftover centavos go to the collector first", () => {
    const shares = computeBillShares("equal", toCentavos("1948.63"), order);
    expect(shares.get(idOf("PA"))).toBe(38973);
    expect(shares.get(idOf("Dan"))).toBe(38972);
    expect(sumCentavos(shares.values())).toBe(194863);
  });

  it("points: rejects negative or all-zero points", () => {
    expect(() => computeBillShares("points", 1000, order, { points: byName({ PA: -1, Dan: 2 }) })).toThrow(
      SettlementError,
    );
    expect(() => computeBillShares("points", 1000, order, { points: new Map() })).toThrow(SettlementError);
  });

  it("points: exact ties go in split order (float math used to break them wrongly)", () => {
    // 81 × 1.1 / 6.6 = 13.5 and 81 × 3.3 / 6.6 = 40.5: a true tie, so PA (collector) gets the centavo.
    const shares = computeBillShares("points", 81, order, { points: byName({ PA: 1.1, Ana: 2.2, Ben: 3.3 }) });
    expect(shares.get(idOf("PA"))).toBe(14);
    expect(shares.get(idOf("Ana"))).toBe(27);
    expect(shares.get(idOf("Ben"))).toBe(40);
  });

  it("points: a member with 0 points pays nothing", () => {
    const shares = computeBillShares("points", 10000, order, { points: byName({ PA: 1, Dan: 1 }) });
    expect(shares.get(idOf("Ben"))).toBe(0);
    expect(sumCentavos(shares.values())).toBe(10000);
  });

  it("manual: shares as given (the bill total is their sum)", () => {
    const shares = computeBillShares("manual", 0, order, { manual: byName({ PA: 500, Ben: 250 }) });
    expect(sumCentavos(shares.values())).toBe(750);
    expect(shares.get(idOf("Dan"))).toBe(0);
  });
});

describe("computeMonth — rules", () => {
  function helperOnly(paidBy: MemberName): MonthInput {
    const total = toCentavos("5500.00");
    return {
      members,
      bills: [{ id: 1, name: "Helper", totalAmount: fromCentavos(total), paidById: idOf(paidBy), status: "confirmed" }],
      billShares: new Map([[1, asShares(computeBillShares("equal", total, order))]]),
      sharedColumns: [
        {
          id: 1,
          name: "Advances Shared",
          splitMode: "equal",
          members: members.map((m) => ({ memberId: m.id, included: true, amount: null })),
        },
      ],
      advances: [],
      payments: [],
      openingBalances: new Map(),
    };
  }

  it("credits whoever paid the bill, collector or not", () => {
    for (const payer of ["PA", "Cara"] as const) {
      const result = computeMonth(helperOnly(payer));
      expect(rowOf(result, payer).monthFinal).toBe(110000 - 550000);
      expect(rowOf(result, "Ben").monthFinal).toBe(110000);
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
    input.openingBalances = byName({ Ben: 50000, PA: -50000 });
    input.payments = [{ fromMemberId: idOf("Ben"), toMemberId: idOf("PA"), amount: "1600.00" }];
    const result = computeMonth(input);
    expect(rowOf(result, "Ben").balance).toBe(50000 + 110000 - 160000);
    expect(rowOf(result, "PA").balance).toBe(-50000 + (110000 - 550000) + 160000);
  });

  it("chains live: this month's Final is next month's opening", () => {
    const august = computeMonth(augustInput());
    const september = computeMonth({ ...helperOnly("PA"), openingBalances: openingBalancesFrom(august) });
    expect(rowOf(september, "Cara").opening).toBe(rowOf(august, "Cara").balance);
    expect(rowOf(september, "Cara").balance).toBe(
      rowOf(august, "Cara").balance + rowOf(september, "Cara").monthFinal,
    );
  });

  it("reports shares that don't add up", () => {
    const input = helperOnly("PA");
    input.billShares.get(1)![0].amount = "0.00";
    expect(() => computeMonth(input)).toThrow(/add up to/);
  });

  it("rejects people who aren't in the month", () => {
    const input = helperOnly("PA");
    input.advances = [{ id: 1, payerId: 999, amount: "10.00", columnId: 1 }];
    expect(() => computeMonth(input)).toThrow(SettlementError);
    input.advances = [{ id: 1, payerId: idOf("PA"), amount: "10.00", columnId: 99 }];
    expect(() => computeMonth(input)).toThrow(SettlementError);
  });
});

describe("shared columns", () => {
  const input = (column: Partial<SettlementColumn>, amount = "1000.00"): MonthInput => ({
    members,
    bills: [],
    billShares: new Map(),
    sharedColumns: [
      {
        id: 1,
        name: "Test",
        splitMode: "equal",
        members: members.map((m) => ({ memberId: m.id, included: true, amount: null })),
        ...column,
      },
    ],
    advances: [{ id: 1, payerId: idOf("Ben"), amount, columnId: 1 }],
    payments: [],
    openingBalances: new Map(),
  });

  it("equal: splits among included members only, leftovers collector-first", () => {
    const result = computeMonth(
      input({
        members: members.map((m) => ({ memberId: m.id, included: m.name !== "Dan", amount: null })),
      }, "10.01"),
    );
    expect(rowOf(result, "Dan").columnShares.get(1)).toBeUndefined();
    expect(rowOf(result, "PA").columnShares.get(1)).toBe(251);
    expect(rowOf(result, "Cara").columnShares.get(1)).toBe(250);
    expect(sumCentavos(result.rows.map((r) => r.monthFinal))).toBe(0);
  });

  it("equal: an empty column has no shares; nobody included is an error once it has advances", () => {
    const none = members.map((m) => ({ memberId: m.id, included: false, amount: null }));
    expect(() => computeMonth(input({ members: none }))).toThrow(SettlementError);
    const empty = { ...input({ members: none }), advances: [] };
    expect(computeMonth(empty).rows.every((r) => r.total === 0)).toBe(true);
  });

  it("manual: uses typed amounts (missing = ₱0) and reports the mismatch instead of failing", () => {
    const result = computeMonth(
      input({
        splitMode: "manual",
        members: [
          { memberId: idOf("PA"), included: true, amount: "600.00" },
          { memberId: idOf("Ben"), included: true, amount: "300.00" },
        ],
      }),
    );
    expect(result.columns[0].difference).toBe(-10000);
    expect(rowOf(result, "Dan").columnShares.get(1)).toBe(0);
    expect(sumCentavos(result.rows.map((r) => r.monthFinal))).toBe(-10000);
  });
});

describe("splitOrder", () => {
  it("puts the collector first so they absorb leftover centavos", () => {
    expect(order.map((id) => members.find((m) => m.id === id)!.name)).toEqual([
      "PA",
      "Ana",
      "Ben",
      "Cara",
      "Dan",
    ]);
  });
});

describe("suggestedPayments", () => {
  const august = computeMonth(augustInput());
  const balances = august.rows.map((r) => ({ memberId: r.member.id, balance: r.balance }));
  const suggestions = suggestedPayments(balances, idOf("PA"));

  it("settles everyone with the collector, largest first", () => {
    const named = suggestions.map((s) => ({
      from: members.find((m) => m.id === s.fromMemberId)!.name,
      to: members.find((m) => m.id === s.toMemberId)!.name,
      amount: fromCentavos(s.amount),
    }));
    expect(named).toEqual([
      { from: "Ana", to: "PA", amount: "15353.91" },
      { from: "PA", to: "Cara", amount: "15059.19" },
      { from: "Ben", to: "PA", amount: "10105.83" },
      { from: "Dan", to: "PA", amount: "5362.76" },
    ]);
  });

  it("recording them all brings every Final to ₱0 except what doesn't add up", () => {
    const input = augustInput();
    input.payments = suggestions.map((s) => ({ ...s, amount: fromCentavos(s.amount) }));
    const settled = computeMonth(input);
    for (const r of settled.rows) {
      // The collector keeps only the Ice Maker's ₱0.02 difference.
      expect(r.balance).toBe(r.member.name === "PA" ? 2 : 0);
    }
  });

  it("suggests nothing without a collector or when everyone is settled", () => {
    expect(suggestedPayments(balances, null)).toEqual([]);
    expect(suggestedPayments([{ memberId: 1, balance: 0 }], 5)).toEqual([]);
  });
});
