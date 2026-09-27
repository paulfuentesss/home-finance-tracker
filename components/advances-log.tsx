"use client";

import { RotateCcw, Search, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { deleteAdvance } from "@/app/periods/[year]/[month]/actions";
import { AddAdvanceDialog } from "@/components/entry-dialogs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_LABELS } from "@/lib/format";
import { formatPHP, sumCentavos } from "@/lib/money";
import type { PeriodView } from "@/lib/periods";

type Advance = PeriodView["advances"][number];

const ALL = "all";

const filterControl =
  "h-8 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-200 focus-visible:border-indigo-500 focus-visible:ring-0";

interface Props {
  view: PeriodView;
  heading: React.ReactNode;
}

// Styling follows the App.jsx prototype (filters beside the title, uppercase table header).
export function AdvancesLog({ view, heading }: Props) {
  const editable = view.period.status === "open";
  const [search, setSearch] = useState("");
  const [payer, setPayer] = useState(ALL);
  const [category, setCategory] = useState(ALL);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return view.advances.filter(
      (a) =>
        (!query || a.description.toLowerCase().includes(query) || a.payerName.toLowerCase().includes(query)) &&
        (payer === ALL || String(a.payerId) === payer) &&
        (category === ALL || a.category === category),
    );
  }, [view.advances, search, payer, category]);

  const isFiltered = search !== "" || payer !== ALL || category !== ALL;
  const payerItems = [
    { value: ALL, label: "All Payers" },
    ...view.members.map((m) => ({ value: String(m.id), label: m.name })),
  ];
  const categoryItems = [
    { value: ALL, label: "All Categories" },
    ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
  ];

  return (
    <>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        {heading}

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2 left-3 size-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search expenses..."
              aria-label="Search expenses"
              className="h-8 w-48 rounded-lg border border-slate-700 bg-slate-900 pr-3 pl-9 text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <Select items={payerItems} value={payer} onValueChange={(v) => setPayer(v ?? ALL)}>
            <SelectTrigger aria-label="Filter by payer" size="sm" className={filterControl}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {payerItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select items={categoryItems} value={category} onValueChange={(v) => setCategory(v ?? ALL)}>
            <SelectTrigger aria-label="Filter by category" size="sm" className={filterControl}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isFiltered && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setPayer(ALL);
                setCategory(ALL);
              }}
              title="Reset Filters"
              aria-label="Reset filters"
              className="rounded-lg bg-slate-700 p-1.5 text-slate-300 transition-colors hover:bg-slate-600"
            >
              <RotateCcw className="size-4" />
            </button>
          )}

          {editable && <AddAdvanceDialog view={view} />}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700/60">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-xs tracking-wider text-slate-400 uppercase">
            <tr>
              <th className="p-3">Payer</th>
              <th className="p-3">Category</th>
              <th className="p-3">Description</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3 text-center">Date</th>
              {editable && (
                <th className="w-10 p-3">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/40">
            {filtered.map((advance) => (
              <tr key={advance.id} className="transition-colors hover:bg-slate-800/40">
                <td className="p-3 font-semibold text-slate-200">{advance.payerName}</td>
                <td className="p-3">
                  <span className="rounded-full border border-slate-600 bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                    {CATEGORY_LABELS[advance.category]}
                  </span>
                </td>
                <td className="p-3 text-slate-300">
                  {advance.description}
                  {advance.customSplit && (
                    <span className="ml-2 rounded-full border border-indigo-500/30 bg-indigo-950/50 px-2 py-0.5 text-[10px] text-indigo-300">
                      custom split
                    </span>
                  )}
                </td>
                <td className="p-3 text-right font-mono font-semibold text-emerald-400">{formatPHP(advance.amount)}</td>
                <td className="p-3 text-center font-mono text-xs text-slate-400">{advance.spentOn}</td>
                {editable && (
                  <td className="p-3 text-right">
                    <DeleteAdvanceButton advance={advance} />
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={editable ? 6 : 5} className="p-8 text-center text-slate-400">
                  {isFiltered ? "No advances match these filters." : "No advances logged this month yet."}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-slate-700/60 bg-slate-900/60 text-xs text-slate-400">
            <tr>
              <td colSpan={3} className="p-3">
                {isFiltered ? `Showing ${filtered.length} of ${view.advances.length}` : `${view.advances.length} advances`}
              </td>
              <td className="p-3 text-right font-mono font-semibold text-slate-200">
                {formatPHP(sumCentavos(filtered.map((a) => a.amount)))}
              </td>
              <td colSpan={editable ? 2 : 1} />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function DeleteAdvanceButton({ advance }: { advance: Advance }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={`Delete ${advance.description}`}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-rose-400"
          />
        }
      >
        <Trash2 className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this advance?</DialogTitle>
          <DialogDescription>
            {advance.description} · {advance.payerName} · {formatPHP(advance.amount)}. Everyone&apos;s shares will be
            recalculated.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteAdvance(advance.id);
                if (result?.ok) setOpen(false);
                else if (result) setError(result.error);
              })
            }
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
