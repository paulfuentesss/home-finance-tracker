// The Trends tab's numbers (docs/features/trends.md): household spending month by month, what it
// went on, and plain insights. Pure (no DB) and tested in lib/trends.test.ts; the page loads the
// months with getTrends in lib/trends-data.ts.
//
// Spending = confirmed bills (the Helper's included) + shared advances, the same as the month
// header's two totals (PeriodView.stats). Payments are money moving between people, and Helper
// entries are already in the Helper bill, so neither counts.

import { CATEGORY_LABELS } from "@/lib/format";
import { sumCentavos, type Centavos } from "@/lib/money";
import { monthHasEnded } from "@/lib/month-lock";

export const RANGES = [1, 3, 6] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = 3;

/** How many months the page loads, ending at the one shown: the range, the period before it, and history for "rising". */
export const LOOKBACK_MONTHS = 12;
/** At most this many colour blocks; the smallest of the rest fold into "Other". */
export const MAX_SERIES = 8;
/** A bill is "rising" when its latest complete month is at least this % above its usual. */
export const RISING_THRESHOLD_PCT = 15;
/** "Usual" = the average of up to this many complete months before the latest. */
export const RISING_LOOKBACK = 3;
/** …and it needs at least this many of them. */
export const RISING_MIN_HISTORY = 2;
/** How many of the biggest single purchases to list. */
export const TOP_PURCHASES = 3;

export type AdvanceCategory = keyof typeof CATEGORY_LABELS;

export interface TrendsMonthInput {
  year: number;
  month: number;
  status: "open" | "closed";
  bills: { name: string; kind: "standard" | "helper"; status: "confirmed" | "pending"; total: Centavos }[];
  advances: { category: AdvanceCategory; description: string; amount: Centavos }[];
  /** People in the month (its period_balances rows; view-only logins are never in one). */
  people: number;
}

export interface Series {
  /** "bill:<name>", "advance:<category>" or "other". */
  key: string;
  label: string;
  kind: "bill" | "advance" | "other";
  /**
   * Its colour: a place in the chart palette (0 = first colour), null for Other. Fixed by the
   * whole loaded history, not the range, so a series keeps its colour when the range changes.
   */
  slot: number | null;
}

export interface TrendsMonth {
  year: number;
  month: number;
  /** Closed, or ended with every bill in (see isComplete). Only complete months feed the insights. */
  complete: boolean;
  total: Centavos;
  /** Keyed by Series.key; series with nothing this month are left out. */
  values: Record<string, Centavos>;
}

export interface BreakdownRow extends Series {
  total: Centavos;
  /** Whole % of the basis total. */
  share: number;
  /** Per month of the basis. */
  average: Centavos;
  /** Whole % change of the monthly average vs the previous period; null when there's nothing to compare. */
  change: number | null;
}

export type Insight =
  | { kind: "top"; label: string; share: number; total: Centavos }
  | { kind: "mover"; label: string; increase: Centavos; change: number | null; previousLabel: string }
  | { kind: "rising"; label: string; latest: Centavos; usual: Centavos; change: number; monthLabel: string }
  | { kind: "purchases"; items: { description: string; amount: Centavos; year: number; month: number }[] }
  | { kind: "perPerson"; average: Centavos };

export interface Trends {
  range: Range;
  /** The months in the range, oldest first (fewer than `range` when the history is shorter). */
  months: TrendsMonth[];
  /** Bottom of the stack first (the biggest). */
  series: Series[];
  /**
   * What the totals, table and insights are worked out from: the range's complete months, or —
   * when none is complete yet — all of them (`partial`, no insights).
   */
  basis: { months: number; label: string; partial: boolean };
  headline: {
    total: Centavos;
    average: Centavos;
    /** The period of the same length before the range, when it has complete months. */
    previous: { label: string; average: Centavos; change: number | null } | null;
  };
  breakdown: BreakdownRow[];
  insights: Insight[];
  /** The newest complete month up to the one shown (where to look when this range has none). */
  latestComplete: { year: number; month: number } | null;
  /**
   * "1 month" only: the months still coming in that it stepped over to show the newest complete
   * one (oldest first); empty otherwise.
   */
  skipped: { year: number; month: number }[];
}

/** `?range=` → a Range; anything else is the default. */
export function parseRange(raw: unknown): Range {
  const n = Number(raw);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : DEFAULT_RANGE;
}

/**
 * Whether a month's numbers are in: closed, or ended (in Manila, `today` from todayInManila) with
 * no bill pending and no standard bill still at ₱0 — bills arrive after their month ends, and a
 * new month's columns start at ₱0. The Helper's ₱0 just means no visits. A month that stays ₱0
 * for good counts once it's closed.
 */
export function isComplete(m: TrendsMonthInput, today: string): boolean {
  if (m.status === "closed") return true;
  if (!monthHasEnded(m.year, m.month, today)) return false;
  return m.bills.every((b) => b.status === "confirmed" && (b.kind === "helper" || b.total > 0));
}

const shortMonth = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" });
const monthName = (month: number) => shortMonth.format(Date.UTC(2000, month - 1, 1));

/** "Aug 2026", "Jun–Aug 2026", "Nov 2025–Jan 2026" (months oldest first). */
export function spanLabel(months: readonly { year: number; month: number }[]): string {
  const first = months[0];
  const last = months.at(-1)!;
  if (months.length === 1) return `${monthName(first.month)} ${first.year}`;
  if (first.year === last.year) return `${monthName(first.month)}–${monthName(last.month)} ${last.year}`;
  return `${monthName(first.month)} ${first.year}–${monthName(last.month)} ${last.year}`;
}

/** Whole % that `part` is of `whole` (whole > 0). */
const percent = (part: Centavos, whole: Centavos) => Math.round((part * 100) / whole);
/** Whole % change from `before` to `after`; null when there's no `before` to divide by. */
const change = (after: Centavos, before: Centavos) => (before > 0 ? percent(after - before, before) : null);

/** A month's spending by raw series key ("bill:Water", "advance:grocery"), ₱0 left out. */
function rawValues(m: TrendsMonthInput): Map<string, Centavos> {
  const values = new Map<string, Centavos>();
  const add = (key: string, amount: Centavos) => {
    if (amount > 0) values.set(key, (values.get(key) ?? 0) + amount);
  };
  for (const b of m.bills) if (b.status === "confirmed") add(`bill:${b.name}`, b.total);
  for (const a of m.advances) add(`advance:${a.category}`, a.amount);
  return values;
}

function seriesOf(key: string, slot: number | null = null): Series {
  if (key.startsWith("bill:")) return { key, label: key.slice("bill:".length), kind: "bill", slot };
  const category = key.slice("advance:".length) as AdvanceCategory;
  return { key, label: CATEGORY_LABELS[category], kind: "advance", slot };
}

const OTHER: Series = { key: "other", label: "Other", kind: "other", slot: null };

/** Sums raw values over months, keyed by raw key. */
function totalsOf(months: readonly { values: Map<string, Centavos> }[]): Map<string, Centavos> {
  const totals = new Map<string, Centavos>();
  for (const m of months) for (const [key, v] of m.values) totals.set(key, (totals.get(key) ?? 0) + v);
  return totals;
}

/**
 * The Trends numbers for the `range` months ending at the newest month in `history` (the month
 * shown). `history` is that month and the ones before it, in any order.
 */
export function buildTrends(history: readonly TrendsMonthInput[], range: Range, today: string): Trends {
  const all = [...history]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((m) => ({ input: m, complete: isComplete(m, today), values: rawValues(m), total: 0 }));
  for (const m of all) m.total = sumCentavos(m.values.values());

  // "1 month" on a month still coming in would be nearly empty, so it shows the newest complete
  // month instead; the months stepped over are `skipped`. (3 and 6 show them faded.)
  const lastComplete = all.findLastIndex((m) => m.complete);
  const steps = range === 1 && lastComplete !== -1 && lastComplete < all.length - 1;
  const shown = steps ? all.slice(0, lastComplete + 1) : all;
  const skipped = steps ? all.slice(lastComplete + 1).map((m) => ({ year: m.input.year, month: m.input.month })) : [];

  const inRange = shown.slice(-range);
  const before = shown.slice(0, -range);
  const previous = before.slice(-range);

  const completeInRange = inRange.filter((m) => m.complete);
  const partial = completeInRange.length === 0;
  const basis = partial ? inRange : completeInRange;
  const previousComplete = previous.filter((m) => m.complete);

  // Which series get their own colour: the biggest over the whole loaded history (so switching
  // the range never repaints one); past MAX_SERIES the smallest fold into Other.
  const historyTotals = [...totalsOf(all)].sort((a, b) => b[1] - a[1]);
  const slots = new Map(
    (historyTotals.length > MAX_SERIES ? historyTotals.slice(0, MAX_SERIES - 1) : historyTotals).map(([key], i) => [
      key,
      i,
    ]),
  );
  const shownKey = (key: string) => (slots.has(key) ? key : "other");
  // The range's colour blocks, biggest first (the bottom of the stack); Other last. "Biggest" is
  // over the basis months, like the table, so a month still coming in can't reorder them; what
  // only that month has goes after, by its amount.
  const basisOrder = totalsOf(basis);
  const rangeTotals = [...totalsOf(inRange)].sort(
    (a, b) => (basisOrder.get(b[0]) ?? 0) - (basisOrder.get(a[0]) ?? 0) || b[1] - a[1],
  );
  const series = [
    ...rangeTotals.filter(([key]) => slots.has(key)).map(([key]) => seriesOf(key, slots.get(key))),
    ...(rangeTotals.some(([key]) => !slots.has(key)) ? [OTHER] : []),
  ];

  const months: TrendsMonth[] = inRange.map((m) => {
    const values: Record<string, Centavos> = {};
    for (const [key, v] of m.values) values[shownKey(key)] = (values[shownKey(key)] ?? 0) + v;
    return { year: m.input.year, month: m.input.month, complete: m.complete, total: m.total, values };
  });

  // Totals over a set of months, by shown key. Keys outside the range (say a column that was
  // renamed) don't count towards any row, and only "Other" collects the folded ones.
  const shownTotals = (ms: typeof all) => {
    const totals = new Map<string, Centavos>();
    for (const [key, v] of totalsOf(ms)) {
      if (!rangeTotals.some(([k]) => k === key)) continue;
      totals.set(shownKey(key), (totals.get(shownKey(key)) ?? 0) + v);
    }
    return totals;
  };

  const basisTotal = sumCentavos(basis.map((m) => m.total));
  const average = Math.round(basisTotal / basis.length);
  const previousAverage = previousComplete.length
    ? Math.round(sumCentavos(previousComplete.map((m) => m.total)) / previousComplete.length)
    : null;
  const previousLabel = previousComplete.length ? spanLabel(previousComplete.map((m) => m.input)) : "";

  const basisTotals = shownTotals(basis);
  const previousTotals = shownTotals(previousComplete);
  const breakdown: BreakdownRow[] = series
    .map((s) => {
      const total = basisTotals.get(s.key) ?? 0;
      const avg = Math.round(total / basis.length);
      const prevAvg = previousComplete.length
        ? Math.round((previousTotals.get(s.key) ?? 0) / previousComplete.length)
        : 0;
      return {
        ...s,
        total,
        share: basisTotal > 0 ? percent(total, basisTotal) : 0,
        average: avg,
        change: !partial && previousComplete.length ? change(avg, prevAvg) : null,
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);

  const insights: Insight[] = [];
  if (!partial && basisTotal > 0) {
    // 1. Where most of it went ("Other" is a mix, so it's never the answer).
    const top = breakdown.find((row) => row.kind !== "other");
    if (top) insights.push({ kind: "top", label: top.label, share: top.share, total: top.total });

    // 2. What grew most per month against the period before.
    if (previousComplete.length) {
      const mover = breakdown
        .filter((row) => row.kind !== "other")
        .map((row) => ({
          row,
          increase: row.average - Math.round((previousTotals.get(row.key) ?? 0) / previousComplete.length),
        }))
        .filter(({ increase }) => increase > 0)
        .sort((a, b) => b.increase - a.increase)[0];
      if (mover) {
        insights.push({
          kind: "mover",
          label: mover.row.label,
          increase: mover.increase,
          change: mover.row.change,
          previousLabel,
        });
      }
    }

    // 3. A bill well above its usual in the latest complete month.
    const latest = basis.at(-1)!;
    const earlier = all.filter((m) => m.complete && all.indexOf(m) < all.indexOf(latest)).slice(-RISING_LOOKBACK);
    const rising = [...latest.values]
      .filter(([key]) => key.startsWith("bill:"))
      .flatMap(([key, amount]) => {
        const past = earlier.map((m) => m.values.get(key)).filter((v): v is Centavos => v !== undefined);
        if (past.length < RISING_MIN_HISTORY) return [];
        const sum = sumCentavos(past);
        // latest ≥ usual × (100 + threshold)%, in integers: latest × n × 100 ≥ sum × (100 + threshold).
        if (sum === 0 || amount * past.length * 100 < sum * (100 + RISING_THRESHOLD_PCT)) return [];
        const usual = Math.round(sum / past.length);
        return [{ label: seriesOf(key).label, latest: amount, usual, change: percent(amount - usual, usual) }];
      })
      .sort((a, b) => b.change - a.change)[0];
    if (rising) {
      insights.push({ kind: "rising", ...rising, monthLabel: spanLabel([latest.input]) });
    }

    // 4. The biggest single purchases.
    const purchases = basis
      .flatMap((m) =>
        m.input.advances.map((a) => ({
          description: a.description,
          amount: a.amount,
          year: m.input.year,
          month: m.input.month,
        })),
      )
      .sort((a, b) => b.amount - a.amount)
      .slice(0, TOP_PURCHASES);
    if (purchases.length) insights.push({ kind: "purchases", items: purchases });

    // 5. Per person, per month.
    const perPerson = basis.filter((m) => m.input.people > 0).map((m) => Math.round(m.total / m.input.people));
    if (perPerson.length) {
      insights.push({ kind: "perPerson", average: Math.round(sumCentavos(perPerson) / perPerson.length) });
    }
  }

  const latestComplete = all[lastComplete];
  return {
    range,
    months,
    series,
    basis: { months: basis.length, label: basis.length ? spanLabel(basis.map((m) => m.input)) : "", partial },
    headline: {
      total: basisTotal,
      average: basis.length ? average : 0,
      previous:
        !partial && previousAverage !== null
          ? { label: previousLabel, average: previousAverage, change: change(average, previousAverage) }
          : null,
    },
    breakdown,
    insights,
    latestComplete: latestComplete ? { year: latestComplete.input.year, month: latestComplete.input.month } : null,
    skipped,
  };
}
