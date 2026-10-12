import { describe, expect, it } from "vitest";
import { collectorNetOf } from "./who-owes";

describe("collectorNetOf", () => {
  it("is the collector's own Final, flipped so receiving is positive", () => {
    // A Final of −₱1,500.00: the collector is owed, so they receive ₱1,500.00.
    expect(collectorNetOf(-150000, 999, [100, -200])).toBe(150000);
    expect(collectorNetOf(2500, 0, [])).toBe(-2500);
  });

  it("without a collector, is what the House Budget holds plus what comes in minus what goes out", () => {
    // Holds ₱10.00; ₱30.00 + ₱5.00 come in; ₱20.00 goes out → ₱25.00.
    expect(collectorNetOf(null, 1000, [3000, -2000, 500, 0])).toBe(2500);
  });
});
