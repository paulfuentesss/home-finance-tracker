// Money helpers. All arithmetic happens in integer centavos (₱1.00 = 100).
// Postgres numeric(12,2) values arrive from Drizzle as strings like "15463.59";
// parse them with toCentavos — never parseFloat — so no floating-point drift creeps in.

export type Centavos = number;

const MONEY_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** "15463.59" → 1546359. Throws on anything that isn't a plain 2-dp decimal string. */
export function toCentavos(value: string): Centavos {
  const match = MONEY_PATTERN.exec(value.trim());
  if (!match) throw new Error(`Invalid money value: "${value}"`);
  const [, sign, whole, fraction = ""] = match;
  const centavos = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return sign ? -centavos : centavos;
}

/**
 * Parses an amount the way people type it ("15,463.59", "₱ 2699", "892.5") into centavos.
 * Returns null for anything that isn't a valid amount.
 */
export function parseMoneyInput(raw: string): Centavos | null {
  try {
    return toCentavos(raw.replace(/[₱,\s]/g, ""));
  } catch {
    return null;
  }
}

/** 1546359 → "15463.59" (the string form Postgres numeric expects). */
export function fromCentavos(centavos: Centavos): string {
  assertInteger(centavos);
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const phpFormatter = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

/** 1546359 → "₱15,463.59" */
export function formatPHP(centavos: Centavos): string {
  assertInteger(centavos);
  return phpFormatter.format(centavos / 100);
}

/**
 * Split a total equally. Leftover centavos (at most ids.length − 1) go one each to the
 * first ids in the given order — pass ids from splitOrder() in lib/settlement.ts so the
 * collector absorbs them.
 * The result always sums exactly to the total.
 *
 * splitEqually(1546359, [a, b, c, d, e]) → a..d get 309272, e gets 309271.
 */
export function splitEqually<Id extends string | number>(
  total: Centavos,
  ids: readonly Id[],
): Map<Id, Centavos> {
  assertInteger(total);
  if (ids.length === 0) throw new Error("Cannot split among zero members");
  if (total < 0) throw new Error("Cannot split a negative total");
  const base = Math.floor(total / ids.length);
  const remainder = total - base * ids.length;
  return new Map(ids.map((id, i) => [id, base + (i < remainder ? 1 : 0)]));
}

/**
 * Split a total by relative weights (e.g. Ice Maker: PA 4, everyone else 1 → 50% / 12.5% each).
 * Uses the largest-remainder method so the result sums exactly to the total; ties go to
 * the earlier entry.
 */
export function splitByWeights<Id extends string | number>(
  total: Centavos,
  weights: readonly (readonly [Id, number])[],
): Map<Id, Centavos> {
  assertInteger(total);
  if (total < 0) throw new Error("Cannot split a negative total");
  const weightSum = weights.reduce((sum, [, w]) => sum + w, 0);
  if (weights.some(([, w]) => w < 0) || weightSum <= 0) {
    throw new Error("Weights must be non-negative with a positive sum");
  }

  const exact = weights.map(([id, w], index) => ({ id, index, raw: (total * w) / weightSum }));
  const result = new Map<Id, Centavos>(exact.map(({ id, raw }) => [id, Math.floor(raw)]));
  let leftover = total - [...result.values()].reduce((a, b) => a + b, 0);

  const byRemainder = [...exact].sort(
    (a, b) => b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw)) || a.index - b.index,
  );
  for (const { id } of byRemainder) {
    if (leftover === 0) break;
    result.set(id, result.get(id)! + 1);
    leftover -= 1;
  }
  return result;
}

export function sumCentavos(values: Iterable<Centavos>): Centavos {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

function assertInteger(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error(`Expected integer centavos, got ${value}`);
}
