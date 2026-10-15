"use client";

import { ListOrdered } from "lucide-react";
import { useState } from "react";
import { seriesColor } from "@/components/trends-colors";
import { Card, Change } from "@/components/trends-parts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPHP } from "@/lib/money";
import type { BreakdownRow } from "@/lib/trends";
import { cn } from "@/lib/utils";

/**
 * Trends tab: the Where it went card, each series' total, monthly average, share and change. Wider
 * screens show Total and Per month side by side; a phone has room for one, so a toggle in the
 * corner picks which (only with more than one month: for one they're the same).
 */
export function WhereItWent({
  rows,
  basisLabel,
  months,
  previousLabel,
}: {
  rows: BreakdownRow[];
  basisLabel: string;
  months: number;
  previousLabel?: string;
}) {
  const [perMonth, setPerMonth] = useState(false);
  const toggle = months > 1 && rows.length > 0;
  // On a phone only the picked one shows; from sm up both always do.
  const totalClass = cn("text-right", toggle && perMonth && "hidden sm:table-cell");
  const averageClass = cn("text-right", !perMonth && "hidden sm:table-cell");

  return (
    <Card
      title="Where it went"
      icon={ListOrdered}
      action={
        toggle && (
          <div role="group" aria-label="Amounts to show" className="flex rounded-lg bg-zinc-100 p-0.5 text-xs">
            {[false, true].map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={perMonth === value}
                onClick={() => setPerMonth(value)}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  perMonth === value ? "bg-white text-foreground shadow-xs" : "text-muted-foreground",
                )}
              >
                {value ? "Per month" : "Total"}
              </button>
            ))}
          </div>
        )
      }
    >
      <p className="mt-1 text-xs text-muted-foreground">
        {basisLabel}
        {previousLabel && <> · change per month vs {previousLabel}</>}
      </p>
      {rows.length ? (
        // No padding at the table's outer edges: it lines up with the title and fits a phone
        // without scrolling sideways.
        <Table className="mt-2 text-sm [&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0">
          <TableHeader>
            <TableRow>
              <TableHead>What</TableHead>
              <TableHead className={totalClass}>Total</TableHead>
              {months > 1 && <TableHead className={averageClass}>Per month</TableHead>}
              <TableHead className="text-right">Share</TableHead>
              {previousLabel && <TableHead className="text-right">Change</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="whitespace-normal">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: seriesColor(row) }} />
                    {row.label}
                  </span>
                </TableCell>
                <TableCell className={cn(totalClass, "font-mono tabular-nums")}>{formatPHP(row.total)}</TableCell>
                {months > 1 && (
                  <TableCell className={cn(averageClass, "font-mono tabular-nums")}>{formatPHP(row.average)}</TableCell>
                )}
                <TableCell className="text-right tabular-nums">{row.share}%</TableCell>
                {previousLabel && (
                  <TableCell className="text-right">
                    <Change change={row.change} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nothing spent yet.</p>
      )}
    </Card>
  );
}
