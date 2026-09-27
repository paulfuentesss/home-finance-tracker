// Pure helpers for the Advances Log: how each row is split, and grouping rows by person.
// No React or DB here, so it's easy to test (lib/advances-log.test.ts).

import { sumCentavos, type Centavos } from "@/lib/money";

export type SplitKind = "everyone" | "subset" | "manual" | "bill";

export interface SplitTag {
  kind: SplitKind;
  label: string;
  /** Shown on hover. */
  hint: string;
  /** The shared column (for one-off column colors). */
  columnId?: number;
}

// Colors for one-off shared columns. Grey (Advances Shared) and violet (Bills) are taken.
// Written out in full so Tailwind can find the class names.
const ONE_OFF_COLORS = [
  "bg-indigo-50 text-indigo-700 ring-indigo-200",
  "bg-amber-50 text-amber-800 ring-amber-200",
  "bg-teal-50 text-teal-700 ring-teal-200",
  "bg-rose-50 text-rose-700 ring-rose-200",
  "bg-sky-50 text-sky-700 ring-sky-200",
  "bg-lime-50 text-lime-800 ring-lime-200",
  "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  "bg-orange-50 text-orange-700 ring-orange-200",
] as const;
export const EVERYONE_COLOR = "bg-zinc-100 text-zinc-700 ring-zinc-200";
export const BILLS_COLOR = "bg-violet-50 text-violet-700 ring-violet-200";

/**
 * Gives each one-off column in a month its own color, in the order they were added, so no
 * two columns share one (the palette only repeats past 8 one-off columns in a month).
 */
export function oneOffColumnColors(columns: readonly { id: number; isDefault: boolean }[]): Map<number, string> {
  const oneOffs = columns.filter((c) => !c.isDefault).sort((a, b) => a.id - b.id);
  return new Map(oneOffs.map((c, i) => [c.id, ONE_OFF_COLORS[i % ONE_OFF_COLORS.length]]));
}

/**
 * Who shares an Auto-equal column, in words: "everyone", or "everyone except PA" when some
 * of the month's members are left out.
 */
export function sharedByLabel(
  includedIds: readonly number[],
  members: readonly { id: number; name: string }[],
): string {
  const excluded = members.filter((m) => !includedIds.includes(m.id)).map((m) => m.name);
  return excluded.length === 0 ? "everyone" : `everyone except ${excluded.join(", ")}`;
}

export interface LogRow {
  key: string;
  /** null for bill rows (bills are managed in the Manage tab). */
  advanceId: number | null;
  payerId: number;
  category: "grocery" | "food" | "service" | "misc" | "bills";
  description: string;
  split: SplitTag;
  amount: Centavos;
  date: string | null;
}

export interface LogGroup {
  /** null = someone no longer in this month ("Former member"). */
  memberId: number | null;
  name: string;
  dotClass: string;
  rows: LogRow[];
  /** Sum of the rows shown (after filters). */
  subtotal: Centavos;
  /** Sum of all their rows — equals Own Advance (−) in the Split Table. */
  fullSubtotal: Centavos;
}

interface ColumnInfo {
  id: number;
  name: string;
  isDefault: boolean;
  splitMode: "equal" | "manual";
  sharedByLabel: string;
}

/**
 * The shared column an advance is in, labeled with the column's own name so it matches the
 * Split Table header. "Advances Shared" is the permanent everyday column; others are added
 * for a month when needed (e.g. "Advances Shared w/o PA", "Ice Maker Adj.").
 */
export function splitForColumn(column: ColumnInfo | undefined): SplitTag {
  if (!column || column.isDefault) {
    return {
      kind: "everyone",
      label: column?.name ?? "Advances Shared",
      hint: "The everyday column — split equally among everyone, every month",
      columnId: column?.id,
    };
  }
  if (column.splitMode === "manual") {
    return {
      kind: "manual",
      label: column.name,
      hint: "Added this month — each person's amount is typed in",
      columnId: column.id,
    };
  }
  return {
    kind: "subset",
    label: column.name,
    hint: `Added this month — split equally among ${column.sharedByLabel}`,
    columnId: column.id,
  };
}

export const BILL_SPLIT: SplitTag = {
  kind: "bill",
  label: "Bills",
  hint: "Paid to the provider — split in the bill's own column, counted here as money this person paid",
};

/**
 * Groups rows by payer in household order (members as given), hiding people with no rows
 * after filtering. Within a group: bills first, then advances by date, undated last.
 * Payers who aren't in `members` go into a final "Former member" group.
 */
export function groupLogRows(
  allRows: readonly LogRow[],
  shownRows: readonly LogRow[],
  members: readonly { id: number; name: string; dotClass: string }[],
): LogGroup[] {
  const known = new Set(members.map((m) => m.id));
  const groupKey = (payerId: number) => (known.has(payerId) ? payerId : null);

  const groups: LogGroup[] = [
    ...members.map((m) => ({ memberId: m.id as number | null, name: m.name, dotClass: m.dotClass })),
    { memberId: null, name: "Former member", dotClass: "bg-zinc-300" },
  ].map((g) => {
    const rows = shownRows.filter((r) => groupKey(r.payerId) === g.memberId).sort(compareRows);
    return {
      ...g,
      rows,
      subtotal: sumCentavos(rows.map((r) => r.amount)),
      fullSubtotal: sumCentavos(allRows.filter((r) => groupKey(r.payerId) === g.memberId).map((r) => r.amount)),
    };
  });
  return groups.filter((g) => g.rows.length > 0);
}

function compareRows(a: LogRow, b: LogRow): number {
  const billFirst = Number(b.category === "bills") - Number(a.category === "bills");
  if (billFirst !== 0) return billFirst;
  if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (!a.date !== !b.date) return a.date ? -1 : 1; // undated last
  return a.key.localeCompare(b.key, undefined, { numeric: true });
}
