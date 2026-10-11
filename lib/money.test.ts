import { describe, expect, it } from "vitest";
import { formatPHP, fromCentavos, parseMoneyInput, splitByWeights, splitEqually, sumCentavos, toCentavos } from "@/lib/money";

describe("toCentavos / fromCentavos", () => {
  it.each([
    ["12507.54", 1250754],
    ["1899.00", 189900],
    ["1899", 189900],
    ["745.5", 74550],
    ["0.01", 1],
    ["-1600.50", -160050],
  ])("parses %s", (input, expected) => {
    expect(toCentavos(input)).toBe(expected);
  });

  it("rejects values that aren't plain 2-dp decimals", () => {
    for (const bad of ["", "abc", "1.234", "1,000.00", "₱100"]) {
      expect(() => toCentavos(bad)).toThrow();
    }
  });

  it("round-trips", () => {
    for (const c of [0, 1, 99, 100, 1250754, -160050]) expect(toCentavos(fromCentavos(c))).toBe(c);
    expect(fromCentavos(5)).toBe("0.05");
    expect(fromCentavos(-160050)).toBe("-1600.50");
  });

  it("formats pesos", () => {
    expect(formatPHP(1250754)).toBe("₱12,507.54");
  });
});

describe("parseMoneyInput", () => {
  it("accepts what people type", () => {
    expect(parseMoneyInput("12,507.54")).toBe(1250754);
    expect(parseMoneyInput("₱ 1,899")).toBe(189900);
    expect(parseMoneyInput(" 745.5 ")).toBe(74550);
  });

  it("returns null for junk", () => {
    for (const bad of ["", "abc", "1.234", "12..5"]) expect(parseMoneyInput(bad)).toBeNull();
  });
});

describe("splitEqually", () => {
  const five = ["Ana", "Ben", "Cara", "Dan", "PA"];

  it("gives leftover centavos to the first members in order", () => {
    // ₱12,507.54 / 5 = 2,501.508 → four get 2,501.51, one gets 2,501.50.
    const shares = splitEqually(toCentavos("12507.54"), five);
    expect([...shares.values()]).toEqual([250151, 250151, 250151, 250151, 250150]);
  });

  it("always sums exactly to the total (the prototype's toFixed drifted)", () => {
    for (const total of ["12507.54", "1948.63", "1899.00", "5500.00", "1000.01", "0.04"]) {
      expect(sumCentavos(splitEqually(toCentavos(total), five).values())).toBe(toCentavos(total));
    }
  });

  it("refuses to split among nobody", () => {
    expect(() => splitEqually(100, [])).toThrow();
  });
});

describe("splitByWeights", () => {
  it("splits the Ice Maker 50% / 12.5% × 4 and sums exactly", () => {
    const shares = splitByWeights(toCentavos("3201.00"), [
      ["PA", 4],
      ["Ana", 1],
      ["Ben", 1],
      ["Cara", 1],
      ["Dan", 1],
    ]);
    expect(Object.fromEntries(shares)).toEqual({
      PA: 160050,
      Ana: 40013,
      Ben: 40013,
      Cara: 40012,
      Dan: 40012,
    });
    expect(sumCentavos(shares.values())).toBe(320100);
  });

  it("whole-number weights use exact integer remainders", () => {
    // 81 split 110 / 220 / 330 → 13.5 / 27 / 40.5: the tie goes to the earlier entry.
    const shares = splitByWeights(81, [
      ["a", 110],
      ["b", 220],
      ["c", 330],
    ]);
    expect(Object.fromEntries(shares)).toEqual({ a: 14, b: 27, c: 40 });
  });

  it("rejects zero or negative weights", () => {
    expect(() => splitByWeights(100, [["a", 0]])).toThrow();
    expect(() => splitByWeights(100, [["a", -1], ["b", 2]])).toThrow();
  });
});
