import { describe, expect, it } from "vitest";
import { buildTrends, isComplete, parseRange, spanLabel, type TrendsMonthInput } from "@/lib/trends";

// Made-up months (round pesos, worked out by hand). `p` = pesos → centavos.
const p = (pesos: number) => pesos * 100;
const TODAY = "2026-10-15";

type Bill = TrendsMonthInput["bills"][number];
const bill = (name: string, pesos: number, extra: Partial<Bill> = {}): Bill => ({
  name,
  kind: name === "Helper" ? "helper" : "standard",
  status: "confirmed",
  total: p(pesos),
  ...extra,
});
const advance = (
  category: TrendsMonthInput["advances"][number]["category"],
  description: string,
  pesos: number,
  spentOn: string | null = null,
) => ({ category, description, amount: p(pesos), spentOn });
const month = (
  m: number,
  status: "open" | "closed",
  bills: Bill[],
  advances: TrendsMonthInput["advances"] = [],
  people = 5,
): TrendsMonthInput => ({ year: 2026, month: m, status, bills, advances, people });

// Apr–Jun closed. Jul ended with the Helper at ₱0 (no visits) → complete. Aug ended, every bill
// in → complete. Sep ended but Meralco is still ₱0 and PLDT Wifi pending → in progress.
const HISTORY: TrendsMonthInput[] = [
  month(4, "closed", [bill("Meralco", 4000), bill("Water", 1000), bill("Helper", 2000)], [advance("grocery", "Market run", 3000)]),
  month(5, "closed", [bill("Meralco", 4000), bill("Water", 1000), bill("Helper", 2000)], [advance("grocery", "Market run", 3000)]),
  month(6, "closed", [bill("Meralco", 4000), bill("Water", 1000), bill("Helper", 2000)], [advance("grocery", "Market run", 5000)]),
  month(
    7,
    "open",
    [bill("Meralco", 5000), bill("Water", 1000), bill("Helper", 0)],
    [advance("grocery", "Market run", 3000), advance("food", "Pizza night", 1000)],
  ),
  month(
    8,
    "open",
    [bill("Meralco", 6000), bill("Water", 1000), bill("Helper", 2000)],
    [
      advance("grocery", "Market run", 2500),
      advance("grocery", "Rice sack", 1500, "2026-08-03"),
      advance("food", "Birthday cake", 1000),
    ],
    4,
  ),
  month(
    9,
    "open",
    [bill("Meralco", 0), bill("Water", 1000), bill("PLDT Wifi", 1500, { status: "pending" })],
    [advance("grocery", "Market run", 2000)],
  ),
];

describe("parseRange", () => {
  it("takes 1, 3 or 6 and falls back to 3", () => {
    expect(parseRange("1")).toBe(1);
    expect(parseRange("6")).toBe(6);
    expect(parseRange(undefined)).toBe(3);
    expect(parseRange("12")).toBe(3);
    expect(parseRange(["6", "1"])).toBe(3);
  });
});

describe("spanLabel", () => {
  it("names one month, a span in a year, and a span across years", () => {
    expect(spanLabel([{ year: 2026, month: 8 }])).toBe("Aug 2026");
    expect(spanLabel([{ year: 2026, month: 6 }, { year: 2026, month: 8 }])).toBe("Jun–Aug 2026");
    expect(spanLabel([{ year: 2025, month: 11 }, { year: 2026, month: 1 }])).toBe("Nov 2025–Jan 2026");
  });
});

describe("isComplete", () => {
  it("counts a closed month even with a ₱0 bill", () => {
    expect(isComplete(month(9, "closed", [bill("Meralco", 0)]), TODAY)).toBe(true);
  });
  it("needs an open month to have ended", () => {
    expect(isComplete(month(10, "open", [bill("Water", 1000)]), TODAY)).toBe(false);
  });
  it("counts an ended month once every standard bill has an amount (the Helper's ₱0 is fine)", () => {
    expect(isComplete(HISTORY[3], TODAY)).toBe(true);
  });
  it("waits for a standard bill still at ₱0, or a pending one", () => {
    expect(isComplete(month(8, "open", [bill("Water", 0)]), TODAY)).toBe(false);
    expect(isComplete(month(8, "open", [bill("Water", 1000, { status: "pending" })]), TODAY)).toBe(false);
  });
});

describe("buildTrends — three months ending September", () => {
  const t = buildTrends(HISTORY, 3, TODAY);

  it("draws Jul–Sep, September in progress, its ₱0 and pending bills left out", () => {
    expect(t.months.map((m) => [m.month, m.complete, m.total])).toEqual([
      [7, true, p(10000)],
      [8, true, p(14000)],
      [9, false, p(3000)],
    ]);
    expect(t.months[2].values).toEqual({ "bill:Water": p(1000), "advance:grocery": p(2000) });
  });

  it("stacks the biggest series first across the whole range", () => {
    // Jul–Sep: Meralco 11,000 · Grocery 9,000 · Water 3,000 · Food 2,000 · Helper 2,000 (tie: first seen first).
    expect(t.series.map((s) => s.label)).toEqual(["Meralco", "Grocery", "Water", "Food", "Helper"]);
  });

  it("colours each series by its place over the whole history, the same in every range", () => {
    // Apr–Sep: Meralco 23,000 · Grocery 20,000 · Helper 8,000 · Water 6,000 · Food 2,000.
    expect(t.series.map((s) => [s.label, s.slot])).toEqual([
      ["Meralco", 0],
      ["Grocery", 1],
      ["Water", 3],
      ["Food", 4],
      ["Helper", 2],
    ]);
    // 1 month (August, below): the same colours.
    expect(buildTrends(HISTORY, 1, TODAY).series.map((s) => [s.label, s.slot])).toEqual([
      ["Meralco", 0],
      ["Grocery", 1],
      ["Helper", 2],
      ["Water", 3],
      ["Food", 4],
    ]);
  });

  it("totals the complete months only, against Apr–Jun", () => {
    expect(t.basis).toEqual({ months: 2, label: "Jul–Aug 2026", partial: false });
    // Apr–Jun average: 32,000 / 3 = 10,666.666… → ₱10,666.67. Change: 1,333.33 / 10,666.67 = 12.5% → 12.
    expect(t.headline).toEqual({
      total: p(24000),
      average: p(12000),
      previous: { label: "Apr–Jun 2026", average: 1066667, change: 12 },
    });
  });

  it("breaks Jul–Aug down by series, compared per month with Apr–Jun", () => {
    expect(t.breakdown.map((r) => [r.label, r.total, r.share, r.average, r.change])).toEqual([
      // 11,000 / 24,000 = 45.8%; 5,500 vs 4,000 → +37.5% → 38
      ["Meralco", p(11000), 46, p(5500), 38],
      // 3,500 vs 11,000 / 3 = 3,666.67 → −4.5% → −5
      ["Grocery", p(7000), 29, p(3500), -5],
      ["Water", p(2000), 8, p(1000), 0],
      // Nothing on food in Apr–Jun: no % to show.
      ["Food", p(2000), 8, p(1000), null],
      ["Helper", p(2000), 8, p(1000), -50],
    ]);
  });

  it("lists what makes up each row, from Jul–Aug only (September's Market run isn't in)", () => {
    const items = (label: string) =>
      t.breakdown.find((r) => r.label === label)!.items.map((i) => [i.label, i.amount, i.month, i.spentOn]);
    // Purchases, biggest first, with their own date when they have one.
    expect(items("Grocery")).toEqual([
      ["Market run", p(3000), 7, null],
      ["Market run", p(2500), 8, null],
      ["Rice sack", p(1500), 8, "2026-08-03"],
    ]);
    // A tie keeps the older one first.
    expect(items("Food")).toEqual([
      ["Pizza night", p(1000), 7, null],
      ["Birthday cake", p(1000), 8, null],
    ]);
    // A bill: one line per month, oldest first; July's ₱0 Helper has no line.
    expect(items("Meralco")).toEqual([
      ["Jul 2026", p(5000), 7, null],
      ["Aug 2026", p(6000), 8, null],
    ]);
    expect(items("Helper")).toEqual([["Aug 2026", p(2000), 8, null]]);
    for (const row of t.breakdown) expect(row.items.reduce((sum, i) => sum + i.amount, 0)).toBe(row.total);
  });

  it("lists September, still coming in, as so far: not in the totals", () => {
    const soFar = (trends: typeof t, label: string) =>
      trends.breakdown.find((r) => r.label === label)!.soFar.map((i) => [i.label, i.amount, i.month]);
    expect(soFar(t, "Grocery")).toEqual([["Market run", p(2000), 9]]);
    // Water's September bill is confirmed; Meralco's is still ₱0, so it has no line.
    expect(soFar(t, "Water")).toEqual([["Sep 2026", p(1000), 9]]);
    expect(soFar(t, "Meralco")).toEqual([]);
    expect(soFar(t, "Food")).toEqual([]);
    // 1 month shows August and steps over September: the same so far.
    const one = buildTrends(HISTORY, 1, TODAY);
    expect(soFar(one, "Grocery")).toEqual([["Market run", p(2000), 9]]);
    expect(soFar(one, "Water")).toEqual([["Sep 2026", p(1000), 9]]);
  });

  it("gives the insights", () => {
    expect(t.insights).toEqual([
      { kind: "top", label: "Meralco", share: 46, total: p(11000) },
      // Meralco +1,500 a month beats Food's +1,000.
      { kind: "mover", label: "Meralco", increase: p(1500), change: 38, previousLabel: "Apr–Jun 2026" },
      // August's Meralco vs May–Jul's (4,000 + 4,000 + 5,000) / 3 = 4,333.33: +38.5% → 38.
      // Helper (2,000 vs May–Jun's 2,000; July's ₱0 isn't a month of it) isn't rising.
      { kind: "rising", label: "Meralco", latest: p(6000), usual: 433333, change: 38, monthLabel: "Aug 2026" },
      {
        kind: "purchases",
        items: [
          { description: "Market run", amount: p(3000), year: 2026, month: 7 },
          { description: "Market run", amount: p(2500), year: 2026, month: 8 },
          { description: "Rice sack", amount: p(1500), year: 2026, month: 8 },
        ],
      },
      // July 10,000 / 5 = 2,000; August 14,000 / 4 = 3,500 → 2,750.
      { kind: "perPerson", average: p(2750) },
    ]);
  });
});

describe("buildTrends — edges", () => {
  it("clips the range to the months there are", () => {
    const t = buildTrends(HISTORY.slice(0, 2), 6, TODAY);
    expect(t.months.map((m) => m.month)).toEqual([4, 5]);
    expect(t.headline.previous).toBeNull();
  });

  it("gives the first-ever month what it can: no comparisons", () => {
    const t = buildTrends(HISTORY.slice(0, 1), 3, TODAY);
    expect(t.insights.map((i) => i.kind)).toEqual(["top", "purchases", "perPerson"]);
    expect(t.breakdown.every((r) => r.change === null)).toBe(true);
  });

  it("shows a month that isn't complete, without insights", () => {
    const t = buildTrends([month(10, "open", [bill("Water", 1000)], [advance("food", "Lunch", 500)])], 1, TODAY);
    expect(t.basis).toEqual({ months: 1, label: "Oct 2026", partial: true });
    expect(t.headline).toEqual({ total: p(1500), average: p(1500), previous: null });
    expect(t.breakdown.map((r) => [r.label, r.share])).toEqual([
      ["Water", 67],
      ["Food", 33],
    ]);
    // October is counted here (it's all there is), so nothing is left as so far.
    expect(t.breakdown.every((r) => r.soFar.length === 0)).toBe(true);
    expect(t.insights).toEqual([]);
    expect(t.latestComplete).toBeNull();
  });

  it("points a range with no complete month at the newest one that is", () => {
    // Aug–Oct, none of them complete (August here still has a ₱0 bill): the newest complete
    // month is July. 3 months never steps back.
    const t = buildTrends(
      [...HISTORY.slice(0, 4), month(8, "open", [bill("Water", 0)]), HISTORY[5], month(10, "open", [])],
      3,
      TODAY,
    );
    expect(t.basis.partial).toBe(true);
    expect(t.latestComplete).toEqual({ year: 2026, month: 7 });
    expect(t.skipped).toEqual([]);
  });

  it("steps 1 month back to the newest complete month when this one is still coming in", () => {
    // September's Meralco isn't in: 1 month shows August, compared with July.
    const t = buildTrends(HISTORY, 1, TODAY);
    expect(t.skipped).toEqual([{ year: 2026, month: 9 }]);
    expect(t.months.map((m) => [m.month, m.complete, m.total])).toEqual([[8, true, p(14000)]]);
    expect(t.basis).toEqual({ months: 1, label: "Aug 2026", partial: false });
    // 14,000 vs July's 10,000: +40%.
    expect(t.headline).toEqual({
      total: p(14000),
      average: p(14000),
      previous: { label: "Jul 2026", average: p(10000), change: 40 },
    });
  });

  it("steps over every month still coming in, and only for 1 month", () => {
    const history = [...HISTORY, month(10, "open", [bill("Water", 1000)])];
    expect(buildTrends(history, 1, TODAY).skipped).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
    ]);
    expect(buildTrends(history, 3, TODAY).skipped).toEqual([]);
    expect(buildTrends(history, 3, TODAY).months.map((m) => m.month)).toEqual([8, 9, 10]);
  });

  it("keeps 1 month on this month when nothing before it is complete either", () => {
    const t = buildTrends([month(10, "open", [bill("Water", 1000)])], 1, TODAY);
    expect(t.skipped).toEqual([]);
    expect(t.basis.partial).toBe(true);
  });

  it("shows no % change against a ₱0 previous period", () => {
    const t = buildTrends([month(7, "closed", []), month(8, "closed", [bill("Water", 1000)])], 1, TODAY);
    expect(t.headline.previous).toEqual({ label: "Jul 2026", average: 0, change: null });
  });

  it("folds the smallest series into Other past eight, and never calls Other the biggest", () => {
    const bills = [9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => bill(`Bill ${n}`, n * 1000));
    const t = buildTrends([month(8, "closed", bills)], 1, TODAY);
    expect(t.series.map((s) => s.key)).toEqual([
      "bill:Bill 9",
      "bill:Bill 8",
      "bill:Bill 7",
      "bill:Bill 6",
      "bill:Bill 5",
      "bill:Bill 4",
      "bill:Bill 3",
      "other",
    ]);
    expect(t.months[0].values.other).toBe(p(3000));
    expect(t.months[0].total).toBe(p(45000));

    // Seven at ₱1,000 and five at ₱999: Other (₱4,995) is the biggest row, but not the top insight.
    const many = [
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => bill(`Big ${n}`, 1000)),
      ...[1, 2, 3, 4, 5].map((n) => bill(`Small ${n}`, 999)),
    ];
    const big = buildTrends([month(8, "closed", many)], 1, TODAY);
    expect(big.breakdown[0]).toMatchObject({ key: "other", total: p(4995) });
    // Other lists what it folded: Small 1–5 at ₱999 each (a tie keeps their order).
    expect(big.breakdown[0].items.map((i) => [i.label, i.amount])).toEqual(
      [1, 2, 3, 4, 5].map((n) => [`Small ${n}`, p(999)]),
    );
    expect(t.breakdown.find((r) => r.key === "other")!.items.map((i) => [i.label, i.amount])).toEqual([
      ["Bill 2", p(2000)],
      ["Bill 1", p(1000)],
    ]);
    expect(big.insights[0]).toMatchObject({ kind: "top", label: "Big 1" });
  });

  it("orders the stack by the complete months, so a month still coming in can't reorder it", () => {
    // Range totals would put Grocery (500 + 5,000) first; August alone has Water ahead. Food is
    // only in October, so it goes last.
    const t = buildTrends(
      [
        month(8, "closed", [bill("Water", 1000)], [advance("grocery", "Market run", 500)]),
        month(10, "open", [], [advance("grocery", "Market run", 5000), advance("food", "Lunch", 100)]),
      ],
      3,
      TODAY,
    );
    expect(t.series.map((s) => s.label)).toEqual(["Water", "Grocery", "Food"]);
  });

  it("starts a new series when a column is renamed", () => {
    const t = buildTrends(
      [month(7, "closed", [bill("Internet", 1500)]), month(8, "closed", [bill("PLDT Wifi", 1500)])],
      1,
      TODAY,
    );
    expect(t.series.map((s) => s.label)).toEqual(["PLDT Wifi"]);
    expect(t.breakdown[0].change).toBeNull();
    // The headline still compares the whole month.
    expect(t.headline.previous?.change).toBe(0);
  });

  it("calls a bill rising at the threshold, not just under it", () => {
    const history = (latest: number) => [
      month(5, "closed", [bill("Water", 1000)]),
      month(6, "closed", [bill("Water", 1000)]),
      month(7, "closed", [bill("Water", latest)]),
    ];
    expect(buildTrends(history(1149), 1, TODAY).insights.some((i) => i.kind === "rising")).toBe(false);
    expect(buildTrends(history(1150), 1, TODAY).insights).toContainEqual({
      kind: "rising",
      label: "Water",
      latest: p(1150),
      usual: p(1000),
      change: 15,
      monthLabel: "Jul 2026",
    });
  });

  it("needs two earlier months before calling a bill rising", () => {
    const t = buildTrends([month(6, "closed", [bill("Water", 1000)]), month(7, "closed", [bill("Water", 5000)])], 1, TODAY);
    expect(t.insights.some((i) => i.kind === "rising")).toBe(false);
  });
});
