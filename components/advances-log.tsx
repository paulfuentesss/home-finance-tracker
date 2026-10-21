"use client";

import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Pencil, RotateCcw, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { deleteAdvance } from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { EmptyState } from "@/components/empty-state";
import { AddAdvanceDialog, EditAdvanceDialog } from "@/components/entry-dialogs";
import { MemberMark } from "@/components/member-mark";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useViewer } from "@/components/viewer-context";
import {
  BILL_SPLIT,
  BILLS_COLOR,
  columnFilterFrom,
  EVERYONE_COLOR,
  groupLogRows,
  inColumn,
  oneOffColumnColors,
  oneOffColumns,
  sharedByLabel,
  splitForColumn,
  type LogGroup,
  type LogRow,
} from "@/lib/advances-log";
import { CATEGORY_LABELS, dayLabel } from "@/lib/format";
import { formatPHP, sumCentavos } from "@/lib/money";
import { canLogIn, canManageAdvance, isAdmin, isViewOnly } from "@/lib/permissions";
import type { PeriodView, ViewAdvance } from "@/lib/periods";
import { cn } from "@/lib/utils";

const ALL = "all";

const CATEGORY_PILLS: Record<LogRow["category"], { label: string; className: string }> = {
  grocery: { label: CATEGORY_LABELS.grocery, className: "bg-amber-50 text-amber-700 ring-amber-200" },
  food: { label: CATEGORY_LABELS.food, className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  service: { label: CATEGORY_LABELS.service, className: "bg-sky-50 text-sky-700 ring-sky-200" },
  misc: { label: CATEGORY_LABELS.misc, className: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
  bills: { label: "Bills", className: BILLS_COLOR },
};

/**
 * Sets (or, for ALL, removes) `?column=` with the native replaceState, which Next picks up in
 * useSearchParams without fetching the page again (node_modules/next/dist/docs: Linking and
 * Navigating → Native History API).
 */
function setColumn(value: string) {
  const url = new URL(window.location.href);
  if (value === ALL) {
    if (!url.searchParams.has("column")) return;
    url.searchParams.delete("column");
  } else {
    if (url.searchParams.get("column") === value) return;
    url.searchParams.set("column", value);
  }
  window.history.replaceState(null, "", url);
}

// Everything each person paid this month, grouped by person: bills they paid to the provider
// (read-only here, never stored as advances) plus their advances.
export function AdvancesLog({ view }: { view: PeriodView }) {
  const viewer = useViewer();
  // Open, and for a housemate not yet ended (the layout's banner says so when it has).
  const open = canLogIn(viewer, view.period);
  // PA logs for anyone; everyone else logs their own, if they're in this month.
  const canAdd =
    open && !isViewOnly(viewer) && (isAdmin(viewer) || view.members.some((m) => m.id === viewer.memberId));
  // Edit/delete: PA any advance; everyone else their own in the default column (lib/permissions.ts).
  const canManage = (a: ViewAdvance) =>
    open &&
    canManageAdvance(viewer, {
      payerId: a.payerId,
      inDefaultColumn: view.columns.find((c) => c.id === a.columnId)?.isDefault === true,
    });
  // The actions column shows only if there's something the viewer can edit.
  const editable = open && (isAdmin(viewer) || view.advances.some(canManage));
  const [search, setSearch] = useState("");
  const [payer, setPayer] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  // The column filter lives in the URL (`?column=<id>`, set by a column total on the Split Table),
  // so any link or refresh shows what the address bar says (docs/decisions.md). Only an id of
  // this month's columns counts (the page drops any other from the URL).
  const searchParams = useSearchParams();
  const column = columnFilterFrom(searchParams.get("column"), view.columns);
  // Groups start closed (`expanded` = the ones opened). A search or filter opens them all so
  // matches are visible; they can still be closed (`closedWhileFiltered`, kept with the filters
  // it was for, so changing a filter opens them all again).
  const [expanded, setExpanded] = useState<Set<number | null>>(new Set());
  const [closedWhileFiltered, setClosedWhileFiltered] = useState<{ filters: string; ids: Set<number | null> }>({
    filters: "",
    ids: new Set(),
  });
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
        // The Helper, once visits are logged: one row per person who handed her money.
        .flatMap((b) =>
          (b.paidBy ?? [{ memberId: b.paidById, amount: b.total }]).map((p) => ({
            key: `bill-${b.id}-${p.memberId}`,
            advanceId: null,
            payerId: p.memberId,
            category: "bills" as const,
            description: b.name,
            split: BILL_SPLIT,
            amount: p.amount,
            date: b.paidBy ? null : b.paidOn,
          })),
        ),
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
        (category === ALL || r.category === category) &&
        inColumn(r, column),
    );
  }, [rows, nameOf, search, payer, category, column]);

  const groups = useMemo(() => groupLogRows(rows, filtered, view.members), [rows, filtered, view.members]);
  const oneOffs = useMemo(() => oneOffColumns(view.columns), [view.columns]);
  const oneOffColors = useMemo(() => oneOffColumnColors(oneOffs), [oneOffs]);
  // Bill rows have no chip (SplitChip shows them as plain text).
  const chipColor = (tag: LogRow["split"]) =>
    tag.kind === "everyone" ? EVERYONE_COLOR : (oneOffColors.get(tag.columnId ?? -1) ?? EVERYONE_COLOR);
  const defaultColumn = view.columns.find((c) => c.isDefault);
  const oneOffLegend = oneOffs.map((c) => ({
    id: c.id,
    name: c.name,
    text:
      c.splitMode === "manual"
        ? "Manual — typed amounts, this month only"
        : `Auto equal — ${sharedByLabel(c.includedIds, view.members)}, this month only`,
  }));
  const isFiltered = search !== "" || payer !== ALL || category !== ALL || column !== null;
  const filters = JSON.stringify([search, payer, category, column]);
  const closedIds = closedWhileFiltered.filters === filters ? closedWhileFiltered.ids : new Set<number | null>();
  const isOpen = (id: number | null) => (isFiltered ? !closedIds.has(id) : expanded.has(id));
  const columnCount = editable ? 6 : 5;
  const allExpanded = groups.length > 0 && groups.every((g) => isOpen(g.memberId));

  const payerItems = [{ value: ALL, label: "All payers" }, ...view.members.map((m) => ({ value: String(m.id), label: m.name }))];
  const categoryItems = [
    { value: ALL, label: "All categories" },
    ...Object.entries(CATEGORY_PILLS).map(([value, { label }]) => ({ value, label })),
  ];
  // The legend's order: the everyday column, then the month's others as they were added.
  const columnItems = [
    { value: ALL, label: "All columns" },
    ...[...(defaultColumn ? [defaultColumn] : []), ...oneOffs].map((c) => ({ value: String(c.id), label: c.name })),
  ];

  // Opens or closes groups; while filtered that's tracked as which are closed, otherwise which are open.
  const setOpen = (ids: (number | null)[], open: boolean) => {
    if (isFiltered) {
      const next = new Set(closedIds);
      for (const id of ids) {
        if (open) next.delete(id);
        else next.add(id);
      }
      setClosedWhileFiltered({ filters, ids: next });
    } else {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (open) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    }
  };
  const toggle = (id: number | null) => setOpen([id], !isOpen(id));

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5">
        <div>
          <h2 className="text-base font-semibold">Advances &amp; Out-of-Pocket Expenses Log</h2>
          <p className="mt-1 text-sm text-muted-foreground">Everything each person paid this month, grouped by person.</p>
        </div>
        {canAdd && <AddAdvanceDialog view={view} className="w-full sm:w-auto" />}
      </div>

      <div className="space-y-2 border-b bg-zinc-50/60 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Phone: search across the top, payer and category sharing the next line, column under them. */}
          <div className="relative w-full sm:w-auto">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search expenses…"
              aria-label="Search expenses"
              className="h-8 w-full rounded-lg border border-input bg-white pr-3 pl-8 text-base focus:border-amber-500 md:text-sm focus:ring-2 focus:ring-amber-500/20 focus:outline-none sm:w-52"
            />
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <FilterSelect label="Filter by payer" items={payerItems} value={payer} onChange={setPayer} />
            <FilterSelect label="Filter by category" items={categoryItems} value={category} onChange={setCategory} />
            <FilterSelect
              label="Filter by column"
              items={columnItems}
              value={column === null ? ALL : String(column)}
              onChange={setColumn}
              // Wider than the others: column names run longer ("Advances Shared w/o PA").
              className="col-span-2 sm:w-56"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 sm:ml-0"
            disabled={!isFiltered}
            onClick={() => {
              setSearch("");
              setPayer(ALL);
              setCategory(ALL);
              setColumn(ALL);
            }}
          >
            <RotateCcw />
            Reset filters
          </Button>
          {groups.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setOpen(
                  groups.map((g) => g.memberId),
                  !allExpanded,
                )
              }
            >
              {allExpanded ? <ChevronsDownUp /> : <ChevronsUpDown />}
              {allExpanded ? "Collapse all" : "Expand all"}
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {isFiltered ? `${filtered.length} of ${rows.length}` : `${rows.length} entries`} · Total{" "}
            <span className="font-mono font-medium text-foreground">{formatPHP(sumCentavos(filtered.map((r) => r.amount)))}</span>
          </span>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="shrink-0 py-0.5 font-medium text-foreground">Column:</span>
          <ul className="grid flex-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
            <Legend color={EVERYONE_COLOR} label={defaultColumn?.name ?? "Advances Shared"} text="everyday, split by all — every month" />
            <Legend label="Own column" text="bills, each split in its own column on the Split Table" />
            {oneOffLegend.map((c) => (
              <Legend key={c.id} color={oneOffColors.get(c.id) ?? EVERYONE_COLOR} label={c.name} text={c.text} />
            ))}
          </ul>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {/* Phones get a two-line layout per entry (PersonGroup), so no column headings. */}
          <thead className="hidden bg-amber-50/60 text-left text-amber-900 md:table-header-group">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Category</th>
              <th className="px-3 py-2.5 font-semibold">Items</th>
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
              collapsed={!isOpen(group.memberId)}
              onToggle={() => toggle(group.memberId)}
              editable={editable}
              canManage={(advanceId) => {
                const advance = advanceOf.get(advanceId);
                return advance !== undefined && canManage(advance);
              }}
              columnCount={columnCount}
              onEdit={(advanceId) => setEditing(advanceOf.get(advanceId) ?? null)}
            />
          ))}
          {groups.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={columnCount} className="p-4">
                  <EmptyState>{isFiltered ? "Nothing matches these filters." : "No advances logged this month yet."}</EmptyState>
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
  canManage,
  columnCount,
  onEdit,
}: {
  group: LogGroup;
  chipColor: (tag: LogRow["split"]) => string;
  collapsed: boolean;
  onToggle: () => void;
  /** Whether the actions column is shown at all. */
  editable: boolean;
  /** Whether this advance's edit/delete buttons are shown. */
  canManage: (advanceId: number) => boolean;
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
            <MemberMark dotClass={group.dotClass} emoji={group.emoji} />
            <span className="font-semibold">{group.name}</span>
            <span className="text-xs text-muted-foreground">
              {group.rows.length} item{group.rows.length === 1 ? "" : "s"}
            </span>
            {/* What's shown, so with no filters it's their Out-of-Pocket by Person. */}
            <span className="ml-auto font-mono font-semibold tabular-nums">{formatPHP(group.subtotal)}</span>
          </button>
        </th>
      </tr>
      {!collapsed &&
        group.rows.map((row) => {
          const pill = CATEGORY_PILLS[row.category];
          const category = (
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", pill.className)}>
              {pill.label}
            </span>
          );
          const date = row.date ? dayLabel(row.date) : "—";
          const actions = row.advanceId !== null && canManage(row.advanceId) && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${row.description}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onEdit(row.advanceId!)}
              >
                <Pencil />
              </Button>
              <ConfirmDeleteButton
                label={`Delete ${row.description}`}
                title="Delete this advance?"
                description={`${row.description} · ${group.name} · ${formatPHP(row.amount)}. Everyone's shares will be recalculated.`}
                onConfirm={() => deleteAdvance(row.advanceId!)}
              />
            </>
          );
          return (
            <Fragment key={row.key}>
              {/* Phone: description and amount, then the tags, date and buttons. */}
              <tr className="border-t border-zinc-100 md:hidden">
                <td colSpan={columnCount} className="px-5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">{row.description}</span>
                    <span className="shrink-0 font-mono font-semibold tabular-nums">{formatPHP(row.amount)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {category}
                      <SplitChip tag={row.split} color={chipColor(row.split)} />
                      <span className="tabular-nums">{date}</span>
                    </div>
                    {actions && <div className="-my-1 flex shrink-0">{actions}</div>}
                  </div>
                </td>
              </tr>
              <tr className="hidden border-t border-zinc-100 hover:bg-zinc-50/60 md:table-row">
                <td className="py-2.5 pr-3 pl-11">{category}</td>
                <td className="px-3 py-2.5">{row.description}</td>
                <td className="px-3 py-2.5">
                  <SplitChip tag={row.split} color={chipColor(row.split)} />
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">{formatPHP(row.amount)}</td>
                <td className="px-3 py-2.5 text-center text-muted-foreground tabular-nums">{date}</td>
                {editable && <td className="px-3 py-2.5 text-center whitespace-nowrap">{actions}</td>}
              </tr>
            </Fragment>
          );
        })}
    </tbody>
  );
}

// A bill isn't in an advance column, so it gets plain text rather than a second "Bills" pill.
function SplitChip({ tag, color }: { tag: LogRow["split"]; color: string }) {
  if (tag.kind === "bill") {
    return (
      <span title={tag.hint} className="text-xs whitespace-nowrap text-muted-foreground">
        {tag.label}
      </span>
    );
  }
  return (
    <span
      title={tag.hint}
      className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset", color)}
    >
      {tag.label}
    </span>
  );
}

/** Without a color, the label is plain text (how bill rows show their column). */
function Legend({ color, label, text }: { color?: string; label: string; text: string }) {
  return (
    <li className="flex items-baseline gap-1.5">
      <span
        className={cn(
          "shrink-0 py-0.5",
          color ? cn("rounded-md px-1.5 text-[11px] font-medium ring-1 ring-inset", color) : "font-medium",
        )}
      >
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
  className,
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange(v ?? ALL)}>
      <SelectTrigger aria-label={label} size="sm" className={cn("w-full bg-white sm:w-40", className)}>
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
