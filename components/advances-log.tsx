"use client";

import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Pencil, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { deleteAdvance } from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { AddAdvanceDialog, EditAdvanceDialog } from "@/components/entry-dialogs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BILL_SPLIT,
  BILLS_COLOR,
  EVERYONE_COLOR,
  groupLogRows,
  oneOffColumnColors,
  sharedByLabel,
  splitForColumn,
  type LogGroup,
  type LogRow,
} from "@/lib/advances-log";
import { CATEGORY_LABELS, dayLabel } from "@/lib/format";
import { formatPHP, sumCentavos } from "@/lib/money";
import type { PeriodView, ViewAdvance } from "@/lib/periods";
import { cn } from "@/lib/utils";

const ALL = "all";

const CATEGORY_PILLS: Record<LogRow["category"], { label: string; className: string }> = {
  grocery: { label: CATEGORY_LABELS.grocery, className: "bg-amber-50 text-amber-700 ring-amber-200" },
  food: { label: CATEGORY_LABELS.food, className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  service: { label: CATEGORY_LABELS.service, className: "bg-sky-50 text-sky-700 ring-sky-200" },
  misc: { label: CATEGORY_LABELS.misc, className: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
  bills: { label: "Bills", className: "bg-violet-50 text-violet-700 ring-violet-200" },
};


// Everything each person paid this month, grouped by person: bills they paid to the provider
// (read-only here, never stored as advances) plus their advances.
export function AdvancesLog({ view }: { view: PeriodView }) {
  const editable = view.period.status === "open";
  const [search, setSearch] = useState("");
  const [payer, setPayer] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  // Groups start closed; a search or filter opens them so matches are visible.
  const [expanded, setExpanded] = useState<Set<number | null>>(new Set());
  const [editing, setEditing] = useState<ViewAdvance | null>(null);
  const nameOf = useMemo(() => new Map(view.members.map((m) => [m.id, m.name])), [view.members]);
  const advanceOf = useMemo(() => new Map(view.advances.map((a) => [a.id, a])), [view.advances]);

  const rows = useMemo<LogRow[]>(() => {
    const columnOf = new Map(
      view.columns.map((c) => [c.id, { ...c, sharedByLabel: sharedByLabel(c.includedIds, view.members) }]),
    );
    return [
      ...view.bills
        .filter((b) => b.status === "confirmed" && b.total > 0)
        .map((b) => ({
          key: `bill-${b.id}`,
          advanceId: null,
          payerId: b.paidById,
          category: "bills" as const,
          description: b.name,
          split: BILL_SPLIT,
          amount: b.total,
          date: b.paidOn,
        })),
      ...view.advances.map((a) => ({
        key: `advance-${a.id}`,
        advanceId: a.id,
        payerId: a.payerId,
        category: a.category,
        description: a.description,
        split: splitForColumn(columnOf.get(a.columnId)),
        amount: a.amount,
        date: a.spentOn,
      })),
    ];
  }, [view.bills, view.advances, view.columns, view.members]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!query ||
          r.description.toLowerCase().includes(query) ||
          (nameOf.get(r.payerId)?.toLowerCase().includes(query) ?? false)) &&
        (payer === ALL || String(r.payerId) === payer) &&
        (category === ALL || r.category === category),
    );
  }, [rows, nameOf, search, payer, category]);

  const groups = useMemo(() => groupLogRows(rows, filtered, view.members), [rows, filtered, view.members]);
  const oneOffColors = useMemo(() => oneOffColumnColors(view.columns), [view.columns]);
  const chipColor = (tag: LogRow["split"]) =>
    tag.kind === "bill"
      ? BILLS_COLOR
      : tag.kind === "everyone"
        ? EVERYONE_COLOR
        : (oneOffColors.get(tag.columnId ?? -1) ?? EVERYONE_COLOR);
  const defaultColumn = view.columns.find((c) => c.isDefault);
  const oneOffLegend = view.columns
    .filter((c) => !c.isDefault)
    .sort((a, b) => a.id - b.id)
    .map((c) => ({
      id: c.id,
      name: c.name,
      text:
        c.splitMode === "manual"
          ? "Manual — typed amounts, this month only"
          : `Auto equal — ${sharedByLabel(c.includedIds, view.members)}, this month only`,
    }));
  const isFiltered = search !== "" || payer !== ALL || category !== ALL;
  const columnCount = editable ? 6 : 5;
  const allExpanded = groups.length > 0 && groups.every((g) => expanded.has(g.memberId));

  const payerItems = [{ value: ALL, label: "All payers" }, ...view.members.map((m) => ({ value: String(m.id), label: m.name }))];
  const categoryItems = [
    { value: ALL, label: "All categories" },
    ...Object.entries(CATEGORY_PILLS).map(([value, { label }]) => ({ value, label })),
  ];

  const toggle = (id: number | null) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5">
        <div>
          <h2 className="text-lg font-semibold">Advances &amp; Out-of-Pocket Expenses Log</h2>
          <p className="mt-1 text-sm text-muted-foreground">Everything each person paid this month, grouped by person.</p>
        </div>
        {editable && <AddAdvanceDialog view={view} />}
      </div>

      <div className="space-y-2 border-b bg-zinc-50/60 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search expenses…"
              aria-label="Search expenses"
              className="h-8 w-52 rounded-lg border border-input bg-white pr-3 pl-8 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
            />
          </div>
          <FilterSelect label="Filter by payer" items={payerItems} value={payer} onChange={setPayer} />
          <FilterSelect label="Filter by category" items={categoryItems} value={category} onChange={setCategory} />
          <Button
            variant="ghost"
            size="sm"
            disabled={!isFiltered}
            onClick={() => {
              setSearch("");
              setPayer(ALL);
              setCategory(ALL);
            }}
          >
            <RotateCcw />
            Reset filters
          </Button>
          {!isFiltered && groups.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(allExpanded ? new Set() : new Set(groups.map((g) => g.memberId)))}
            >
              {allExpanded ? <ChevronsDownUp /> : <ChevronsUpDown />}
              {allExpanded ? "Collapse all" : "Expand all"}
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {isFiltered ? `${filtered.length} of ${rows.length}` : `${rows.length} entries`} ·{" "}
            <span className="font-mono font-medium text-foreground">{formatPHP(sumCentavos(filtered.map((r) => r.amount)))}</span>
          </span>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="shrink-0 py-0.5 font-medium text-foreground">Column:</span>
          <ul className="grid flex-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
            <Legend color={EVERYONE_COLOR} label={defaultColumn?.name ?? "Advances Shared"} text="everyday, split by all — every month" />
            <Legend color={BILLS_COLOR} label="Bills" text="paid to the provider" />
            {oneOffLegend.map((c) => (
              <Legend key={c.id} color={oneOffColors.get(c.id) ?? EVERYONE_COLOR} label={c.name} text={c.text} />
            ))}
          </ul>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-amber-50/60 text-left text-amber-900">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Category</th>
              <th className="px-3 py-2.5 font-semibold">Items / Description</th>
              <th className="px-3 py-2.5 font-semibold">Column</th>
              <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
              <th className="px-3 py-2.5 text-center font-semibold">Date</th>
              {editable && (
                <th className="w-24 px-3 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          {groups.map((group) => (
            <PersonGroup
              key={group.memberId ?? "former"}
              group={group}
              chipColor={chipColor}
              collapsed={!isFiltered && !expanded.has(group.memberId)}
              onToggle={() => toggle(group.memberId)}
              editable={editable}
              columnCount={columnCount}
              onEdit={(advanceId) => setEditing(advanceOf.get(advanceId) ?? null)}
            />
          ))}
          {groups.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={columnCount} className="py-10 text-center text-muted-foreground">
                  {isFiltered ? "Nothing matches these filters." : "No advances logged this month yet."}
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
      {editable && <EditAdvanceDialog view={view} advance={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function PersonGroup({
  group,
  chipColor,
  collapsed,
  onToggle,
  editable,
  columnCount,
  onEdit,
}: {
  group: LogGroup;
  chipColor: (tag: LogRow["split"]) => string;
  collapsed: boolean;
  onToggle: () => void;
  editable: boolean;
  columnCount: number;
  onEdit: (advanceId: number) => void;
}) {
  return (
    <tbody className="border-t">
      <tr className="bg-zinc-50">
        <th scope="rowgroup" colSpan={columnCount} className="p-0 text-left font-normal">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            className="flex w-full items-center gap-2.5 px-5 py-2.5 text-left hover:bg-zinc-100"
          >
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
            <span className={cn("size-2.5 rounded-full", group.dotClass)} aria-hidden />
            <span className="font-semibold">{group.name}</span>
            <span className="text-xs text-muted-foreground">
              {group.rows.length} item{group.rows.length === 1 ? "" : "s"}
            </span>
          </button>
        </th>
      </tr>
      {!collapsed &&
        group.rows.map((row) => {
          const pill = CATEGORY_PILLS[row.category];
          return (
            <tr key={row.key} className="border-t border-zinc-100 hover:bg-zinc-50/60">
              <td className="py-2.5 pr-3 pl-11">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", pill.className)}>
                  {pill.label}
                </span>
              </td>
              <td className="px-3 py-2.5">{row.description}</td>
              <td className="px-3 py-2.5">
                <SplitChip tag={row.split} color={chipColor(row.split)} />
              </td>
              <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">{formatPHP(row.amount)}</td>
              <td className="px-3 py-2.5 text-center text-muted-foreground tabular-nums">
                {row.date ? dayLabel(row.date) : "—"}
              </td>
              {editable && (
                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                  {row.advanceId !== null && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${row.description}`}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => onEdit(row.advanceId!)}
                    >
                      <Pencil />
                    </Button>
                  )}
                  {row.advanceId !== null && (
                    <ConfirmDeleteButton
                      label={`Delete ${row.description}`}
                      title="Delete this advance?"
                      description={`${row.description} · ${group.name} · ${formatPHP(row.amount)}. Everyone's shares will be recalculated.`}
                      onConfirm={() => deleteAdvance(row.advanceId!)}
                    />
                  )}
                </td>
              )}
            </tr>
          );
        })}
    </tbody>
  );
}

function SplitChip({ tag, color }: { tag: LogRow["split"]; color: string }) {
  return (
    <span
      title={tag.hint}
      className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset", color)}
    >
      {tag.label}
    </span>
  );
}

function Legend({ color, label, text }: { color: string; label: string; text: string }) {
  return (
    <li className="flex items-baseline gap-1.5">
      <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", color)}>
        {label}
      </span>
      <span>{text}</span>
    </li>
  );
}

function FilterSelect({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange(v ?? ALL)}>
      <SelectTrigger aria-label={label} size="sm" className="w-40 bg-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
