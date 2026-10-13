import { describe, expect, it } from "vitest";
import { partOfDayInManila, shortMonthLabel, shortMonthName } from "./format";

describe("shortMonthName / shortMonthLabel", () => {
  it("is the month's three capital letters, then the year", () => {
    expect(shortMonthName(10)).toBe("OCT");
    expect(shortMonthName(1)).toBe("JAN");
    expect(shortMonthName(12)).toBe("DEC");
    expect(shortMonthLabel(2026, 10)).toBe("OCT 2026");
  });
});

describe("partOfDayInManila", () => {
  // Manila is UTC+8 all year.
  const at = (manilaTime: string) => new Date(`2026-10-13T${manilaTime}:00+08:00`);

  it("is morning from 4 AM until noon", () => {
    expect(partOfDayInManila(at("04:00"))).toBe("morning");
    expect(partOfDayInManila(at("11:59"))).toBe("morning");
  });

  it("is afternoon from noon until 6 PM", () => {
    expect(partOfDayInManila(at("12:00"))).toBe("afternoon");
    expect(partOfDayInManila(at("17:59"))).toBe("afternoon");
  });

  it("is evening from 6 PM, through the night until 4 AM", () => {
    expect(partOfDayInManila(at("18:00"))).toBe("evening");
    expect(partOfDayInManila(at("00:00"))).toBe("evening");
    expect(partOfDayInManila(at("03:59"))).toBe("evening");
  });
});
