// Who owes what, as Who owes what (components/settle-summary.tsx) and the greeting
// (components/greeting.tsx) say it. Pure and browser-safe (type imports only), so both draw the
// same numbers from the month's Finals (docs/settlement-rules.md); no new money math here.

import type { Centavos } from "@/lib/money";

/**
 * What the collector gets overall: positive = gets back, negative = pays. With a collector in the
 * month it's their own Final, flipped (a Final is negative when they're owed). Without one, it's
 * what's left for whoever looks after the House Budget: what it holds, plus what comes in, minus
 * what goes out.
 */
export function collectorNetOf(
  collectorBalance: Centavos | null,
  held: Centavos,
  otherBalances: readonly Centavos[],
): Centavos {
  if (collectorBalance !== null) return -collectorBalance;
  const collects = otherBalances.reduce((sum, b) => (b > 0 ? sum + b : sum), 0);
  const paysOut = otherBalances.reduce((sum, b) => (b < 0 ? sum - b : sum), 0);
  return held + collects - paysOut;
}
