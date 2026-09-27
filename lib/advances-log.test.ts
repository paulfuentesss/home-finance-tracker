import { describe, expect, it } from "vitest";
import { BILL_SPLIT, groupLogRows, oneOffColumnColors, splitForColumn, type LogRow } from "@/lib/advances-log";

const members = [
  { id: 1, name: "Ate Toni", dotClass: "a" },
  { id: 2, name: "Skyler", dotClass: "b" },
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
    expect(groups.map((g) => g.name)).toEqual(["Skyler", "PA", "Former member"]);
  });

  it("puts bills first, then advances by date, undated last", () => {
    const [skyler, pa] = groupLogRows(rows, rows, members);
    expect(pa.rows.map((r) => r.key)).toEqual(["bill-1", "advance-3"]);
    expect(skyler.rows.map((r) => r.key)).toEqual(["advance-2", "advance-1"]);
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
