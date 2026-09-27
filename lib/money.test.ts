import { describe, expect, it } from "vitest";
import { formatPHP, fromCentavos, parseMoneyInput, splitByWeights, splitEqually, sumCentavos, toCentavos } from "@/lib/money";

describe("toCentavos / fromCentavos", () => {
  it.each([
    ["15463.59", 1546359],
    ["2699.00", 269900],
    ["2699", 269900],
    ["892.5", 89250],
    ["0.01", 1],
    ["-1880.50", -188050],
  ])("parses %s", (input, expected) => {
    expect(toCentavos(input)).toBe(expected);
  });

  it("rejects values that aren't plain 2-dp decimals", () => {
    for (const bad of ["", "abc", "1.234", "1,000.00", "₱100"]) {
      expect(() => toCentavos(bad)).toThrow();
    }
  });

  it("round-trips", () => {
    for (const c of [0, 1, 99, 100, 1546359, -188050]) expect(toCentavos(fromCentavos(c))).toBe(c);
    expect(fromCentavos(5)).toBe("0.05");
    expect(fromCentavos(-188050)).toBe("-1880.50");
  });

  it("formats pesos", () => {
    expect(formatPHP(1546359)).toBe("₱15,463.59");
  });
});

describe("parseMoneyInput", () => {
  it("accepts what people type", () => {
    expect(parseMoneyInput("15,463.59")).toBe(1546359);
    expect(parseMoneyInput("₱ 2,699")).toBe(269900);
    expect(parseMoneyInput(" 892.5 ")).toBe(89250);
  });

  it("returns null for junk", () => {
    for (const bad of ["", "abc", "1.234", "12..5"]) expect(parseMoneyInput(bad)).toBeNull();
  });
});

describe("splitEqually", () => {
  const five = ["Ate Toni", "Mayee", "Skyler", "PJ", "PA"];

  it("gives leftover centavos to the first members in order", () => {
    // ₱15,463.59 / 5 = 3,092.718 → four get 3,092.72, one gets 3,092.71.
    const shares = splitEqually(toCentavos("15463.59"), five);
    expect([...shares.values()]).toEqual([309272, 309272, 309272, 309272, 309271]);
  });

  it("always sums exactly to the total (the prototype's toFixed drifted)", () => {
    for (const total of ["15463.59", "2173.63", "2699.00", "6400.00", "1000.01", "0.04"]) {
      expect(sumCentavos(splitEqually(toCentavos(total), five).values())).toBe(toCentavos(total));
    }
  });

  it("refuses to split among nobody", () => {
    expect(() => splitEqually(100, [])).toThrow();
  });
});

describe("splitByWeights", () => {
  it("splits the Ice Maker 50% / 12.5% × 4 and sums exactly", () => {
    const shares = splitByWeights(toCentavos("3761.00"), [
      ["PA", 4],
      ["Ate Toni", 1],
      ["Mayee", 1],
      ["Skyler", 1],
      ["PJ", 1],
    ]);
    expect(Object.fromEntries(shares)).toEqual({
      PA: 188050,
      "Ate Toni": 47013,
      Mayee: 47013,
      Skyler: 47012,
      PJ: 47012,
    });
    expect(sumCentavos(shares.values())).toBe(376100);
  });

  it("rejects zero or negative weights", () => {
    expect(() => splitByWeights(100, [["a", 0]])).toThrow();
    expect(() => splitByWeights(100, [["a", -1], ["b", 2]])).toThrow();
  });
});
