"use client";

import { ChevronRight, ChevronsDownUp, ListOrdered } from "lucide-react";
import { Fragment, useId, useState } from "react";
import { seriesColor } from "@/components/trends-colors";
import { Card, Change } from "@/components/trends-parts";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dayLabel } from "@/lib/format";
import { formatPHP, sumCentavos } from "@/lib/money";
import { spanLabel, type BreakdownItem, type BreakdownRow } from "@/lib/trends";
import { cn } from "@/lib/utils";

/** How many of a row's items show before "Show all". */
const PREVIEW_ITEMS = 5;

const LINK_BUTTON =
  "rounded-sm font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Trends tab: the Where it went card, each series' total, monthly average, share and change. Wider
 * screens show Total and Monthly avg side by side; a phone has room for one, so a toggle in the
 * corner picks which (only with more than one month: for one they're the same). Tapping a row
 * opens what makes it up under it (BreakdownRow.items): the purchases, or a bill's months.
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
  // The open rows, kept with the months they were opened on: a range switch that changes the
  // months closes them (one that shows the same months keeps them).
  const [open, setOpen] = useState<{ for: string; keys: Set<string> }>({ for: basisLabel, keys: new Set() });
  const openKeys = open.for === basisLabel ? open.keys : new Set<string>();
  const toggleRow = (key: string) => {
    const keys = new Set(openKeys);
    if (!keys.delete(key)) keys.add(key);
    setOpen({ for: basisLabel, keys });
  };
  const id = useId();
  const toggle = months > 1 && rows.length > 0;
  // What, Total, (Monthly avg), Share, (Change). On a phone one of Total / Monthly avg is hidden;
  // an open row's cell spanning one column too many there is harmless.
  const columns = 3 + (months > 1 ? 1 : 0) + (previousLabel ? 1 : 0);
  // On a phone only the picked one shows; from sm up both always do. A cell fades in each time
  // it's shown again (CSS animations restart when display: none ends), so a flip is easy to see.
  const fade = "max-sm:animate-in max-sm:fade-in max-sm:duration-200";
  const totalClass = cn("text-right", fade, toggle && perMonth && "hidden sm:table-cell");
  const averageClass = cn("text-right", fade, !perMonth && "hidden sm:table-cell");

  return (
    <Card
      title="Where it went"
      icon={ListOrdered}
      action={
        toggle && (
          // Two equal halves, so the white pill (half the width, less the padding) slides across
          // by its own width. Reduced motion: it jumps.
          <div
            role="group"
            aria-label="Amounts to show"
            className="relative grid grid-cols-2 rounded-lg bg-zinc-100 p-0.5 text-xs"
          >
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-white shadow-xs transition-transform duration-200 ease-out motion-reduce:transition-none",
                perMonth && "translate-x-full",
              )}
            />
            {[false, true].map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={perMonth === value}
                onClick={() => setPerMonth(value)}
                className={cn(
                  "relative rounded-md px-2.5 py-1 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  perMonth === value ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {value ? "Monthly avg" : "Total"}
              </button>
            ))}
          </div>
        )
      }
    >
      {/* min-h holds the line's height, so it doesn't jump when Collapse all comes and goes. */}
      <div className="mt-1 flex min-h-6 items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {basisLabel}
          {months > 1 && <> · {months} months</>}
          {previousLabel && <> · change per month vs {previousLabel}</>}
        </p>
        {openKeys.size > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 h-6 shrink-0 px-2 text-xs"
            onClick={() => setOpen({ for: basisLabel, keys: new Set() })}
          >
            <ChevronsDownUp />
            Collapse all
          </Button>
        )}
      </div>
      {rows.length ? (
        // No padding at the table's outer edges: it lines up with the title and fits a phone
        // without scrolling sideways.
        <Table className="mt-2 text-sm [&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0">
          <TableHeader>
            <TableRow>
              <TableHead>What</TableHead>
              <TableHead className={totalClass}>Total</TableHead>
              {months > 1 && <TableHead className={averageClass}>Monthly avg</TableHead>}
              <TableHead className="text-right">Share</TableHead>
              {previousLabel && <TableHead className="text-right">Change</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
              // A bill over one month has a single line, the same as its total: nothing to open,
              // unless a month still coming in has its bill so far.
              const expandable = row.kind !== "bill" || row.items.length > 1 || row.soFar.length > 0;
              const isOpen = expandable && openKeys.has(row.key);
              const itemsId = `${id}-items-${i}`;
              const label = (
                <>
                  <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: seriesColor(row) }} />
                  <span className="min-w-0 flex-1">
                    {row.label}
                    {/* Its share as a bar, at least a sliver for one that rounds to 0%. The Share
                        column says the same in words. */}
                    <span
                      aria-hidden
                      className="mt-1 block h-1 rounded-full"
                      style={{ width: `max(${row.share}%, 2px)`, background: seriesColor(row) }}
                    />
                  </span>
                </>
              );
              return (
                <Fragment key={row.key}>
                  {/* The row is the click target; the button inside makes it reachable by
                      keyboard, and its click bubbles up here (no handler of its own, or one tap
                      would toggle twice). */}
                  <TableRow
                    onClick={expandable ? () => toggleRow(row.key) : undefined}
                    className={cn(expandable && "cursor-pointer", isOpen && "border-b-0")}
                  >
                    <TableCell className="whitespace-normal">
                      {expandable ? (
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={isOpen ? itemsId : undefined}
                          className="flex w-full items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ChevronRight
                            aria-hidden
                            className={cn(
                              "size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                              isOpen && "rotate-90",
                            )}
                          />
                          {label}
                        </button>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="size-4 shrink-0" />
                          {label}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={cn(totalClass, "font-mono tabular-nums")}>{formatPHP(row.total)}</TableCell>
                    {months > 1 && (
                      <TableCell className={cn(averageClass, "font-mono tabular-nums")}>
                        {formatPHP(row.average)}
                      </TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">{row.share}%</TableCell>
                    {previousLabel && (
                      <TableCell className="text-right">
                        <Change change={row.change} />
                      </TableCell>
                    )}
                  </TableRow>
                  {isOpen && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell id={itemsId} colSpan={columns} className="pt-0 whitespace-normal">
                        <RowItems row={row} onHide={() => toggleRow(row.key)} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nothing spent yet.</p>
      )}
    </Card>
  );
}

/**
 * An open row's items, then those of each month shown but not counted ("so far", outside the
 * totals). Always real amounts (a purchase, a month's bill), even with Monthly avg picked. Hide
 * closes it from the bottom, handy once a long list has pushed the row's chevron off screen.
 */
function RowItems({ row, onHide }: { row: BreakdownRow; onHide: () => void }) {
  const dated = row.kind === "advance";
  // soFar is in month order, so a month's items are next to each other.
  const soFarMonths: BreakdownItem[][] = [];
  for (const item of row.soFar) {
    const last = soFarMonths.at(-1);
    if (last && last[0].year === item.year && last[0].month === item.month) last.push(item);
    else soFarMonths.push([item]);
  }
  return (
    <div className="rounded-lg bg-zinc-50 p-3 text-xs animate-in fade-in duration-200">
      <ItemList items={row.items} dated={dated} />
      {soFarMonths.map((items) => (
        <div key={`${items[0].year}-${items[0].month}`} className="mt-3 border-t pt-3">
          <p className="mb-1.5">
            <span className="font-medium">{spanLabel([items[0]])} so far</span>
            <span className="text-muted-foreground"> · not counted yet</span>
          </p>
          <ItemList items={items} dated={dated} />
          {items.length > 1 && (
            <div className="mt-1.5 flex items-baseline justify-between gap-3 font-medium">
              So far
              <span className="font-mono tabular-nums">{formatPHP(sumCentavos(items.map((i) => i.amount)))}</span>
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={onHide} className={cn(LINK_BUTTON, "mt-2 text-muted-foreground")}>
        Hide
      </button>
    </div>
  );
}

/** A list of items, the first few then "Show all". A purchase shows its own date, or its month without one. */
function ItemList({ items, dated }: { items: BreakdownItem[]; dated: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, PREVIEW_ITEMS);
  return (
    <>
      <ul className="grid gap-1.5">
        {shown.map((item, i) => (
          <li key={i} className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1">
              {item.label}
              {dated && (
                <span className="text-muted-foreground">
                  {" "}
                  · {item.spentOn ? dayLabel(item.spentOn) : spanLabel([item])}
                </span>
              )}
            </span>
            <span className="font-mono tabular-nums">{formatPHP(item.amount)}</span>
          </li>
        ))}
      </ul>
      {!all && items.length > PREVIEW_ITEMS && (
        <button type="button" onClick={() => setAll(true)} className={cn(LINK_BUTTON, "mt-2 block")}>
          Show all {items.length}
        </button>
      )}
    </>
  );
}
