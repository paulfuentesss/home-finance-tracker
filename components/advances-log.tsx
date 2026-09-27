"use client";

import { RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { deleteAdvance } from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { AddAdvanceDialog } from "@/components/entry-dialogs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_LABELS, dayLabel } from "@/lib/format";
import { formatPHP, sumCentavos } from "@/lib/money";
import type { Category, PeriodView } from "@/lib/periods";
import { cn } from "@/lib/utils";

const ALL = "all";

type LogCategory = Category | "bills";

const CATEGORY_PILLS: Record<LogCategory, { label: string; className: string }> = {
  grocery: { label: CATEGORY_LABELS.grocery, className: "bg-amber-50 text-amber-700 ring-amber-200" },
  food: { label: CATEGORY_LABELS.food, className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  service: { label: CATEGORY_LABELS.service, className: "bg-sky-50 text-sky-700 ring-sky-200" },
  misc: { label: CATEGORY_LABELS.misc, className: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
  bills: { label: "Bills", className: "bg-violet-50 text-violet-700 ring-violet-200" },
};

interface LogRow {
  key: string;
  advanceId: number | null;
  payerId: number;
  category: LogCategory;
  description: string;
  tags: { label: string; className: string }[];
  amount: number;
  date: string | null;
}

// Real advances plus read-only "Direct Bill Pay" rows for bills someone paid (never stored
// as advances, so nothing is counted twice).
export function AdvancesLog({ view }: { view: PeriodView }) {
  const editable = view.period.status === "open";
  const [search, setSearch] = useState("");
  const [payer, setPayer] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const memberOf = useMemo(() => new Map(view.members.map((m) => [m.id, m])), [view.members]);

  const rows = useMemo<LogRow[]>(
    () => [
      ...view.bills
        .filter((b) => b.status === "confirmed" && b.total > 0)
        .map((b) => ({
          key: `bill-${b.id}`,
          advanceId: null,
          payerId: b.paidById,
          category: "bills" as const,
          description: b.name,
          tags: [{ label: "Direct Bill Pay", className: "text-violet-600" }],
          amount: b.total,
          date: b.paidOn,
        })),
      ...view.advances.map((a) => ({
        key: `advance-${a.id}`,
        advanceId: a.id,
        payerId: a.payerId,
        category: a.category,
        description: a.description,
        tags: [
          ...(a.customSplit ? [{ label: "custom split", className: "text-indigo-600" }] : []),
          ...(a.sharedLabel ? [{ label: a.sharedLabel, className: "text-zinc-500" }] : []),
        ],
        amount: a.amount,
        date: a.spentOn,
      })),
    ],
    [view.bills, view.advances],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!query ||
          r.description.toLowerCase().includes(query) ||
          (memberOf.get(r.payerId)?.name.toLowerCase().includes(query) ?? false)) &&
        (payer === ALL || String(r.payerId) === payer) &&
        (category === ALL || r.category === category),
    );
  }, [rows, memberOf, search, payer, category]);

  const isFiltered = search !== "" || payer !== ALL || category !== ALL;
  const payerItems = [{ value: ALL, label: "All payers" }, ...view.members.map((m) => ({ value: String(m.id), label: m.name }))];
  const categoryItems = [
    { value: ALL, label: "All categories" },
    ...Object.entries(CATEGORY_PILLS).map(([value, { label }]) => ({ value, label })),
  ];

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5">
        <div>
          <h2 className="text-lg font-semibold">Advances &amp; Out-of-Pocket Expenses Log</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Groceries, food, services and bills paid by individual members.
          </p>
        </div>
        {editable && <AddAdvanceDialog view={view} />}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b bg-zinc-50/60 px-5 py-3">
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
        <span className="ml-auto text-xs text-muted-foreground">
          {isFiltered ? `${filtered.length} of ${rows.length}` : `${rows.length} entries`} ·{" "}
          <span className="font-mono font-medium text-foreground">{formatPHP(sumCentavos(filtered.map((r) => r.amount)))}</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-amber-50/60 text-left text-amber-900">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Person</th>
              <th className="px-3 py-2.5 font-semibold">Category</th>
              <th className="px-3 py-2.5 font-semibold">Items / Description</th>
              <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
              <th className="px-3 py-2.5 text-center font-semibold">Date</th>
              {editable && (
                <th className="w-14 px-3 py-2.5 text-center font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((row) => {
              const member = memberOf.get(row.payerId);
              const pill = CATEGORY_PILLS[row.category];
              return (
                <tr key={row.key} className="hover:bg-zinc-50/60">
                  <td className="px-5 py-2.5 font-medium">
                    <span className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", member?.dotClass ?? "bg-zinc-300")} aria-hidden />
                      {member?.name ?? "Former member"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", pill.className)}>
                      {pill.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.description}
                    {row.tags.map((tag) => (
                      <span key={tag.label} className={cn("ml-2 text-xs italic", tag.className)}>
                        ({tag.label})
                      </span>
                    ))}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">{formatPHP(row.amount)}</td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground tabular-nums">
                    {row.date ? dayLabel(row.date) : "—"}
                  </td>
                  {editable && (
                    <td className="px-3 py-2.5 text-center">
                      {row.advanceId !== null && (
                        <ConfirmDeleteButton
                          label={`Delete ${row.description}`}
                          title="Delete this advance?"
                          description={`${row.description} · ${member?.name ?? ""} · ${formatPHP(row.amount)}. Everyone's shares will be recalculated.`}
                          onConfirm={() => deleteAdvance(row.advanceId!)}
                        />
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={editable ? 6 : 5} className="py-10 text-center text-muted-foreground">
                  {isFiltered ? "Nothing matches these filters." : "No advances logged this month yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
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
