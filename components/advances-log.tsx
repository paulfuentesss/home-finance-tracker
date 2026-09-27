"use client";

import { RotateCcw, Search, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { deleteAdvance } from "@/app/periods/[year]/[month]/actions";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CATEGORY_LABELS, dayLabel } from "@/lib/format";
import { formatPHP, sumCentavos } from "@/lib/money";
import type { PeriodView } from "@/lib/periods";

type Advance = PeriodView["advances"][number];

const ALL = "all";

interface Props {
  view: PeriodView;
}

export function AdvancesLog({ view }: Props) {
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
    { value: ALL, label: "All payers" },
    ...view.members.map((m) => ({ value: String(m.id), label: m.name })),
  ];
  const categoryItems = [
    { value: ALL, label: "All categories" },
    ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search expenses…"
            aria-label="Search expenses"
            className="pl-8"
          />
        </div>

        <Select items={payerItems} value={payer} onValueChange={(v) => setPayer(v ?? ALL)}>
          <SelectTrigger aria-label="Filter by payer" className="w-40">
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
          <SelectTrigger aria-label="Filter by category" className="w-40">
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

        <Button
          variant="outline"
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
      </div>

      <p className="text-sm text-muted-foreground">
        {isFiltered ? `Showing ${filtered.length} of ${view.advances.length}` : `${view.advances.length} advances`} ·{" "}
        {formatPHP(sumCentavos(filtered.map((a) => a.amount)))}
      </p>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Date</TableHead>
              <TableHead>Payer</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {editable && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((advance) => (
              <TableRow key={advance.id}>
                <TableCell className="text-muted-foreground tabular-nums">{dayLabel(advance.spentOn)}</TableCell>
                <TableCell className="font-medium">{advance.payerName}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{CATEGORY_LABELS[advance.category]}</Badge>
                </TableCell>
                <TableCell>
                  {advance.description}
                  {advance.customSplit && (
                    <Badge variant="outline" className="ml-2">
                      custom split
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono font-medium tabular-nums">
                  {formatPHP(advance.amount)}
                </TableCell>
                {editable && (
                  <TableCell>
                    <DeleteAdvanceButton advance={advance} />
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={editable ? 6 : 5} className="py-8 text-center text-muted-foreground">
                  {isFiltered ? "No advances match these filters." : "No advances logged this month yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
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
        render={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${advance.description}`} />}
      >
        <Trash2 />
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
