// Grey placeholder blocks shown while a tab loads: each tab's loading.tsx draws its own shape, so
// nothing jumps when the real cards arrive (they then fade in, components/page-enter.tsx).
// The grids copy each page's own (app/periods/[year]/[month]/*/page.tsx and the components they render).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function Block({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-zinc-200/70", className)} />;
}

/** A white card: a heading bar, then `rows` table-like lines. */
function CardSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-xl border bg-white p-5 shadow-xs", className)}>
      <Block className="h-5 w-40" />
      {Array.from({ length: rows }, (_, i) => (
        <Block key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}

/** The screen-reader line and the shape, for a tab's loading.tsx. */
function Loading({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <>
      <p className="sr-only" role="status">
        Loading…
      </p>
      <div className={className} aria-hidden>
        {children}
      </div>
    </>
  );
}

/** Split Table: the greeting, the settle summary, then the table. */
export function SplitSkeleton() {
  return (
    <Loading className="space-y-6">
      <Block className="h-20 rounded-xl" />
      <CardSkeleton rows={2} />
      <CardSkeleton rows={7} />
    </Loading>
  );
}

/** Advances and Settle Up: a wide column beside a 22rem one on desktop. */
export function SideColumnSkeleton({ main = 7, side = 4 }: { main?: number; side?: number }) {
  return (
    <Loading className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <CardSkeleton rows={main} />
      <CardSkeleton rows={side} />
    </Loading>
  );
}

/** Manage: two columns of stacked cards on desktop. */
export function ManageSkeleton() {
  return (
    <Loading className="grid items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <CardSkeleton rows={5} />
        <CardSkeleton rows={3} />
      </div>
      <div className="space-y-6">
        <CardSkeleton rows={2} />
        <CardSkeleton rows={4} />
      </div>
    </Loading>
  );
}

/** Billers: the intro card, then the billers two to a row on desktop. */
export function BillersSkeleton() {
  return (
    <Loading className="space-y-6">
      <Block className="h-20 rounded-xl" />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <CardSkeleton key={i} rows={3} />
        ))}
      </div>
    </Loading>
  );
}

/** Receipts: the intro card, then a tile per bill (two, then three to a row). */
export function ReceiptsSkeleton() {
  return (
    <Loading className="space-y-6">
      <Block className="h-16 rounded-xl" />
      <Block className="h-5 w-16" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} rows={2} />
        ))}
      </div>
    </Loading>
  );
}

/** Helper: the two totals side by side, then the visits. */
export function HelperSkeleton() {
  return (
    <Loading className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Block className="h-24 rounded-xl" />
        <Block className="h-24 rounded-xl" />
      </div>
      <CardSkeleton rows={6} />
    </Loading>
  );
}
