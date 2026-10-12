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
  HOUSE_BUDGET,
  houseBudgetMonth,
  houseBudgetThrough,
  openingBalancesFrom,
  partyFromColumn,
  partyToColumn,
  SettlementError,
  splitOrder,
  suggestedPayments,
  type MonthInput,
  type Party,
  type SettlementColumn,
  type SettlementMember,
  type SettlementPayment,
  type SettlementShare,
  type SuggestedPayment,
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

  // Helper ₱5,500 handed over by PA ₱3,000 and Cara ₱2,500 (lib/helper.ts): ₱1,100 each.
  // PA: 1,100 − 3,000 = −1,900 · Cara: 1,100 − 2,500 = −1,400 · the others +1,100.
  it("credits each payer their part of a bill with several payers", () => {
    const input = helperOnly("PA");
    input.bills[0].paidBy = [
      { memberId: idOf("PA"), amount: "3000.00" },
      { memberId: idOf("Cara"), amount: "2500.00" },
    ];
    const result = computeMonth(input);
    expect(rowOf(result, "PA").billsPaid).toBe(300000);
    expect(rowOf(result, "Cara").billsPaid).toBe(250000);
    expect(rowOf(result, "PA").monthFinal).toBe(-190000);
    expect(rowOf(result, "Cara").monthFinal).toBe(-140000);
    expect(rowOf(result, "Ben").monthFinal).toBe(110000);
    expect(sumCentavos(result.rows.map((r) => r.monthFinal))).toBe(0);
  });

  it("reports payers that don't add up to the bill, or aren't in the month", () => {
    const input = helperOnly("PA");
    input.bills[0].paidBy = [{ memberId: idOf("PA"), amount: "5000.00" }];
    expect(() => computeMonth(input)).toThrow(/Payers of Helper add up to/);
    input.bills[0].paidBy = [{ memberId: 999, amount: "5500.00" }];
    expect(() => computeMonth(input)).toThrow(SettlementError);
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
    input.payments = [{ fromMemberId: idOf("Ben"), toMemberId: idOf("PA"), amount: "1600.00", status: "confirmed" }];
    const result = computeMonth(input);
    expect(rowOf(result, "Ben").balance).toBe(50000 + 110000 - 160000);
    expect(rowOf(result, "PA").balance).toBe(-50000 + (110000 - 550000) + 160000);
  });

  // Helper ₱5,500 ÷ 5 = ₱1,100 each, paid by PA: Ben's Final is +₱1,100, PA's −₱4,400.
  it("ignores a housemate's waiting or rejected payment, Finals and carry-over alike", () => {
    const input = helperOnly("PA");
    input.payments = [
      { fromMemberId: idOf("Ben"), toMemberId: idOf("PA"), amount: "1100.00", status: "pending" },
      { fromMemberId: idOf("Cara"), toMemberId: idOf("PA"), amount: "500.00", status: "rejected" },
    ];
    const result = computeMonth(input);
    for (const r of result.rows) expect([r.paidOut, r.received]).toEqual([0, 0]);
    expect(rowOf(result, "Ben").balance).toBe(110000);
    expect(rowOf(result, "Cara").balance).toBe(110000);
    expect(rowOf(result, "PA").balance).toBe(-440000);
    const next = openingBalancesFrom(result);
    expect(next.get(idOf("Ben"))).toBe(110000);
    expect(next.get(idOf("PA"))).toBe(-440000);
  });

  it("counts it once PA confirms it, like a payment PA recorded", () => {
    const input = helperOnly("PA");
    input.payments = [{ fromMemberId: idOf("Ben"), toMemberId: idOf("PA"), amount: "1100.00", status: "confirmed" }];
    const result = computeMonth(input);
    expect(rowOf(result, "Ben").balance).toBe(110000 - 110000);
    expect(rowOf(result, "PA").balance).toBe(-440000 + 110000);
  });

  it("doesn't trip over a rejected payment from someone who has left the month", () => {
    const input = helperOnly("PA");
    input.payments = [{ fromMemberId: 999, toMemberId: idOf("PA"), amount: "100.00", status: "rejected" }];
    expect(() => computeMonth(input)).not.toThrow();
    input.payments[0].status = "confirmed";
    expect(() => computeMonth(input)).toThrow(SettlementError);
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

// The House Budget (docs/settlement-rules.md → House Budget). August's Finals (above):
// Ana 15,353.91 · Ben 10,105.83 · Dan 5,362.76 owe; Cara −15,059.19 and PA −15,763.29 are owed.
const nameOfParty = (party: Party) =>
  party === HOUSE_BUDGET ? "House Budget" : members.find((m) => m.id === party)!.name;
const named = (suggestions: SuggestedPayment[]) =>
  suggestions.map((s) => ({ from: nameOfParty(s.fromMemberId), to: nameOfParty(s.toMemberId), amount: fromCentavos(s.amount) }));
const recorded = (suggestions: SuggestedPayment[]): SettlementPayment[] =>
  suggestions.map((s) => ({ ...s, amount: fromCentavos(s.amount), status: "confirmed" as const }));
const balancesOf = (result: ReturnType<typeof computeMonth>) =>
  result.rows.map((r) => ({ memberId: r.member.id, balance: r.balance }));

describe("suggestedPayments", () => {
  const balances = balancesOf(computeMonth(augustInput()));
  const suggestions = suggestedPayments(balances, idOf("PA"), 0);

  // In: 15,353.91 + 10,105.83 + 5,362.76 = 30,822.50. Out to Cara 15,059.19. Left for PA:
  // 30,822.50 − 15,059.19 = 15,763.31.
  it("pays into the House Budget, pays out whoever is owed, then what's left to the collector", () => {
    expect(named(suggestions)).toEqual([
      { from: "Ana", to: "House Budget", amount: "15353.91" },
      { from: "Ben", to: "House Budget", amount: "10105.83" },
      { from: "Dan", to: "House Budget", amount: "5362.76" },
      { from: "House Budget", to: "Cara", amount: "15059.19" },
      { from: "House Budget", to: "PA", amount: "15763.31" },
    ]);
  });

  it("recording them all brings every Final and the House Budget to ₱0, except what doesn't add up", () => {
    const input = augustInput();
    input.payments = recorded(suggestions);
    const settled = computeMonth(input);
    for (const r of settled.rows) {
      // PA: −15,763.29 + 15,763.31 = +0.02, the Ice Maker's difference.
      expect(r.balance).toBe(r.member.name === "PA" ? 2 : 0);
    }
    expect(houseBudgetMonth(0, input.payments)).toEqual({ opening: 0, received: 3082250, paidOut: 3082250, balance: 0 });
  });

  it("counts what the House Budget already holds: PA's Final doesn't move until it's paid out", () => {
    const input = augustInput();
    input.payments = [{ fromMemberId: idOf("Dan"), toMemberId: HOUSE_BUDGET, amount: "5362.76", status: "confirmed" }];
    const result = computeMonth(input);
    const budget = houseBudgetMonth(0, input.payments);
    expect(rowOf(result, "Dan").balance).toBe(0);
    expect(rowOf(result, "PA").balance).toBe(-1576329);
    expect(budget.balance).toBe(536276);
    // Everyone's Final + the House Budget still adds up to the ₱0.02 difference.
    expect(sumCentavos(result.rows.map((r) => r.balance)) + budget.balance).toBe(2);
    // 5,362.76 held + 15,353.91 + 10,105.83 − 15,059.19 = 15,763.31 still left for PA.
    expect(named(suggestedPayments(balancesOf(result), idOf("PA"), budget.balance))).toEqual([
      { from: "Ana", to: "House Budget", amount: "15353.91" },
      { from: "Ben", to: "House Budget", amount: "10105.83" },
      { from: "House Budget", to: "Cara", amount: "15059.19" },
      { from: "House Budget", to: "PA", amount: "15763.31" },
    ]);
  });

  it("allows paying out before money comes in: the House Budget goes negative, and the collector still gets the rest", () => {
    const input = augustInput();
    input.payments = [{ fromMemberId: HOUSE_BUDGET, toMemberId: idOf("Cara"), amount: "15059.19", status: "confirmed" }];
    const result = computeMonth(input);
    const budget = houseBudgetMonth(0, input.payments);
    expect(budget.balance).toBe(-1505919);
    expect(rowOf(result, "Cara").balance).toBe(0);
    // −15,059.19 + 30,822.50 = 15,763.31.
    expect(named(suggestedPayments(balancesOf(result), idOf("PA"), budget.balance)).at(-1)).toEqual({
      from: "House Budget",
      to: "PA",
      amount: "15763.31",
    });
  });

  it("has the collector pay in what the House Budget would be short", () => {
    // PA owes ₱5.00, Ben is owed ₱5.00, nothing held: the House Budget pays Ben, PA covers it.
    const pa = idOf("PA");
    const ben = idOf("Ben");
    const result = suggestedPayments(
      [
        { memberId: pa, balance: 500 },
        { memberId: ben, balance: -500 },
      ],
      pa,
      0,
    );
    expect(named(result)).toEqual([
      { from: "House Budget", to: "Ben", amount: "5.00" },
      { from: "PA", to: "House Budget", amount: "5.00" },
    ]);
  });

  it("suggests nothing without a collector, or when everyone is settled and the House Budget is empty", () => {
    expect(suggestedPayments(balances, null, 0)).toEqual([]);
    expect(suggestedPayments([{ memberId: 1, balance: 0 }], 5, 0)).toEqual([]);
    // Something still held is the collector's.
    expect(named(suggestedPayments([{ memberId: idOf("Ben"), balance: 0 }], idOf("PA"), 1000))).toEqual([
      { from: "House Budget", to: "PA", amount: "10.00" },
    ]);
  });
});

describe("houseBudgetMonth", () => {
  const into = (amount: string, status: SettlementPayment["status"] = "confirmed"): SettlementPayment => ({
    fromMemberId: idOf("Ben"),
    toMemberId: HOUSE_BUDGET,
    amount,
    status,
  });

  it("counts only confirmed payments", () => {
    expect(houseBudgetMonth(0, [into("100.00", "pending"), into("50.00", "rejected"), into("20.00")])).toEqual({
      opening: 0,
      received: 2000,
      paidOut: 0,
      balance: 2000,
    });
  });

  it("carries over: what's left opens the next month", () => {
    const august = houseBudgetMonth(0, [
      into("300.00"),
      { fromMemberId: HOUSE_BUDGET, toMemberId: idOf("PA"), amount: "100.00", status: "confirmed" },
    ]);
    expect(august.balance).toBe(20000);
    expect(houseBudgetMonth(august.balance, [into("5.00")])).toEqual({
      opening: 20000,
      received: 500,
      paidOut: 0,
      balance: 20500,
    });
  });

  it("carries through every month from the first (houseBudgetThrough, used by computePeriod)", () => {
    const pay = (from: Party, to: Party, amount: string): SettlementPayment => ({
      fromMemberId: from,
      toMemberId: to,
      amount,
      status: "confirmed",
    });
    // July: ₱300.00 in, ₱100.00 out → ₱200.00. August: nothing. September: ₱5.00 in → ₱205.00.
    const july = [pay(idOf("Ben"), HOUSE_BUDGET, "300.00"), pay(HOUSE_BUDGET, idOf("PA"), "100.00")];
    expect(houseBudgetThrough([])).toEqual({ opening: 0, received: 0, paidOut: 0, balance: 0 });
    expect(houseBudgetThrough([july, []])).toEqual({ opening: 20000, received: 0, paidOut: 0, balance: 20000 });
    expect(houseBudgetThrough([july, [], [pay(idOf("Ben"), HOUSE_BUDGET, "5.00")]])).toEqual({
      opening: 20000,
      received: 500,
      paidOut: 0,
      balance: 20500,
    });
  });

  // Next month opens each member with this month's Final and the House Budget with what it holds,
  // so their sum doesn't change across months: it stays the Ice Maker's ₱0.02.
  it("keeps everyone's Final + the House Budget the same from one month to the next", () => {
    const august = augustInput();
    august.payments = [{ fromMemberId: idOf("Dan"), toMemberId: HOUSE_BUDGET, amount: "5362.76", status: "confirmed" }];
    const augustResult = computeMonth(august);
    const september: MonthInput = {
      ...august,
      bills: [],
      billShares: new Map(),
      sharedColumns: [],
      advances: [],
      payments: [{ fromMemberId: HOUSE_BUDGET, toMemberId: idOf("Cara"), amount: "5000.00", status: "confirmed" }],
      openingBalances: openingBalancesFrom(augustResult),
    };
    const septemberResult = computeMonth(september);
    const budget = houseBudgetThrough([august.payments, september.payments]);
    expect(budget.opening).toBe(536276);
    expect(budget.balance).toBe(36276);
    expect(sumCentavos(septemberResult.rows.map((r) => r.balance)) + budget.balance).toBe(2);
  });

  it("ignores payments between two members, and computeMonth ignores the House Budget's side", () => {
    const between: SettlementPayment = { fromMemberId: idOf("PA"), toMemberId: idOf("Cara"), amount: "15059.19", status: "confirmed" };
    expect(houseBudgetMonth(0, [between]).balance).toBe(0);
    const input = augustInput();
    input.payments = [between, into("10105.83")];
    const result = computeMonth(input);
    expect(rowOf(result, "Cara").balance).toBe(0);
    expect(rowOf(result, "Ben").balance).toBe(0);
    // PA paid Cara from his own account, so he's owed that too: −15,763.29 − 15,059.19.
    expect(rowOf(result, "PA").balance).toBe(-3082248);
  });

  it("refuses a payment with the House Budget on both sides", () => {
    const input = augustInput();
    input.payments = [{ fromMemberId: HOUSE_BUDGET, toMemberId: HOUSE_BUDGET, amount: "1.00", status: "confirmed" }];
    expect(() => computeMonth(input)).toThrow(SettlementError);
  });
});

describe("payment sides as stored", () => {
  it("stores the House Budget as NULL and reads NULL back as the House Budget", () => {
    expect(partyToColumn(HOUSE_BUDGET)).toBeNull();
    expect(partyToColumn(3)).toBe(3);
    expect(partyFromColumn(null)).toBe(HOUSE_BUDGET);
    expect(partyFromColumn(3)).toBe(3);
  });
});
