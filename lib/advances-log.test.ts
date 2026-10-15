import { describe, expect, it } from "vitest";
import {
  BILL_SPLIT,
  columnFilterFrom,
  groupLogRows,
  inColumn,
  oneOffColumnColors,
  oneOffColumns,
  sharedByLabel,
  splitForColumn,
  type LogRow,
} from "@/lib/advances-log";

describe("columnFilterFrom", () => {
  const columns = [{ id: 4 }, { id: 12 }];

  it("takes the id of a column in this month", () => {
    expect(columnFilterFrom("4", columns)).toBe(4);
    expect(columnFilterFrom("12", columns)).toBe(12);
  });

  it("ignores a column that isn't in this month", () => {
    expect(columnFilterFrom("7", columns)).toBeNull();
  });

  it("ignores anything that isn't one plain id", () => {
    for (const param of [null, "", "abc", "1.5", "-4", " 4", "4abc", "0x4", "04", "4.0", "1.2e1"]) {
      expect(columnFilterFrom(param, columns)).toBeNull();
    }
    // "" would be Number("") = 0; a column with id 0 must still not match it.
    expect(columnFilterFrom("", [{ id: 0 }])).toBeNull();
  });
});

describe("inColumn", () => {
  const inFour = splitForColumn({ id: 4, name: "w/o PA", isDefault: false, splitMode: "equal", sharedByLabel: "" });
  const advance = (split: LogRow["split"]): LogRow => ({
    key: "advance-1",
    advanceId: 1,
    payerId: 1,
    category: "grocery",
    description: "x",
    split,
    amount: 100,
    date: null,
  });
  const bill: LogRow = { ...advance(BILL_SPLIT), key: "bill-1", advanceId: null, category: "bills" };

  it("keeps every row when no column is picked", () => {
    expect(inColumn(advance(inFour), null)).toBe(true);
    expect(inColumn(bill, null)).toBe(true);
  });

  it("keeps only that column's advances, never bills", () => {
    expect(inColumn(advance(inFour), 4)).toBe(true);
    expect(inColumn(advance(inFour), 12)).toBe(false);
    expect(inColumn(bill, 4)).toBe(false);
  });

  it("matches the default column and Manual columns by id too", () => {
    const everyday = splitForColumn({ id: 2, name: "Advances Shared", isDefault: true, splitMode: "equal", sharedByLabel: "" });
    const manual = splitForColumn({ id: 7, name: "Ice Maker Adj.", isDefault: false, splitMode: "manual", sharedByLabel: "" });
    expect(inColumn(advance(everyday), 2)).toBe(true);
    expect(inColumn(advance(everyday), 7)).toBe(false);
    expect(inColumn(advance(manual), 7)).toBe(true);
  });
});

describe("oneOffColumns", () => {
  it("drops the default column and sorts the rest as they were added", () => {
    const columns = [
      { id: 9, isDefault: false },
      { id: 2, isDefault: true },
      { id: 5, isDefault: false },
    ];
    expect(oneOffColumns(columns).map((c) => c.id)).toEqual([5, 9]);
  });
});

const members = [
  { id: 1, name: "Ana", dotClass: "a" },
  { id: 2, name: "Cara", dotClass: "b" },
  { id: 5, name: "PA", dotClass: "c" },
];
const everyone = splitForColumn(undefined);

const row = (key: string, payerId: number, amount: number, date: string | null, bill = false): LogRow => ({
  key,
  advanceId: bill ? null : Number(key.replace(/\D/g, "")),
  payerId,
  category: bill ? "bills" : "grocery",
  description: key,
  split: bill ? BILL_SPLIT : everyone,
  amount,
  date,
});

const rows = [
  row("advance-3", 5, 1000, "2026-08-04"),
  row("bill-1", 5, 5000, "2026-08-31", true),
  row("advance-1", 2, 300, null),
  row("advance-2", 2, 200, "2026-08-19"),
  row("advance-9", 99, 50, "2026-08-01"),
];

describe("groupLogRows", () => {
  it("groups in household order, hides empty groups, former members last", () => {
    const groups = groupLogRows(rows, rows, members);
    expect(groups.map((g) => g.name)).toEqual(["Cara", "PA", "Former member"]);
  });

  it("puts bills first, then advances by date, undated last", () => {
    const [cara, pa] = groupLogRows(rows, rows, members);
    expect(pa.rows.map((r) => r.key)).toEqual(["bill-1", "advance-3"]);
    expect(cara.rows.map((r) => r.key)).toEqual(["advance-2", "advance-1"]);
  });

  it("subtotal follows the filter; fullSubtotal is always everything", () => {
    const shown = rows.filter((r) => r.category === "bills");
    const [pa] = groupLogRows(rows, shown, members);
    expect(pa.subtotal).toBe(5000);
    expect(pa.fullSubtotal).toBe(6000);
  });
});

describe("splitForColumn", () => {
  const base = { id: 1, splitMode: "equal" as const, sharedByLabel: "everyone except PA" };

  it("default column keeps its name and counts as everyone", () => {
    expect(splitForColumn({ ...base, name: "Advances Shared", isDefault: true })).toMatchObject({
      kind: "everyone",
      label: "Advances Shared",
    });
  });

  it("situational columns show their full name, matching the Split Table", () => {
    const tag = splitForColumn({ ...base, name: "Advances Shared w/o PA", isDefault: false });
    expect(tag).toMatchObject({ kind: "subset", label: "Advances Shared w/o PA" });
    expect(tag.hint).toContain("everyone except PA");
  });

  it("manual columns keep their name", () => {
    expect(
      splitForColumn({ ...base, name: "Ice Maker Adj.", isDefault: false, splitMode: "manual" }),
    ).toMatchObject({ kind: "manual", label: "Ice Maker Adj." });
  });
});

describe("oneOffColumnColors", () => {
  it("gives each one-off column a different color, in the order added; the default gets none", () => {
    const colors = oneOffColumnColors([
      { id: 7, isDefault: false },
      { id: 3, isDefault: true },
      { id: 5, isDefault: false },
    ]);
    expect(colors.has(3)).toBe(false);
    expect(colors.get(5)).not.toBe(colors.get(7));
    expect([...colors.keys()]).toEqual([5, 7]);
  });
});

describe("sharedByLabel", () => {
  it("says everyone when nobody is left out, otherwise names who is", () => {
    expect(sharedByLabel([1, 2, 5], members)).toBe("everyone");
    expect(sharedByLabel([1, 2], members)).toBe("everyone except PA");
    expect(sharedByLabel([2], members)).toBe("everyone except Ana, PA");
  });
});
