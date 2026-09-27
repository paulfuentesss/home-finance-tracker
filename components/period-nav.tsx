"use client";

import { Check, ChevronLeft, ChevronRight, CalendarPlus, DollarSign, Layers, ReceiptText, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startNextMonth } from "@/app/periods/[year]/[month]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { monthLabel } from "@/lib/format";
import type { PeriodSummary } from "@/lib/periods";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "", label: "Monthly Split Table", icon: Layers },
  { href: "/advances", label: "Advances Log & Report", icon: DollarSign },
  { href: "/receipts", label: "Payment Proofs / Receipts", icon: ReceiptText },
  { href: "/manage", label: "Manage Columns & People", icon: Settings },
] as const;

/** The part of the path after /periods/y/m, so switching months keeps the same tab. */
function useTabSuffix() {
  const pathname = usePathname();
  return pathname.replace(/^\/periods\/\d+\/\d+/, "");
}

export function TabNav({ base }: { base: string }) {
  const suffix = useTabSuffix();
  return (
    <nav aria-label="Sections" className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = suffix === href;
        return (
          <Link
            key={href}
            href={`${base}${href}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-amber-600 text-amber-700"
                : "border-transparent text-muted-foreground hover:border-zinc-300 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * "‹ August 2026 ›". The arrows only show when there's a month that way; clicking the month
 * name opens a list of every month that exists (newest first). Switching keeps the same tab.
 * On the latest month the list ends with "Start <next month>", which asks before creating it.
 */
export function MonthPicker({
  periods,
  current,
  canStartNext,
}: {
  periods: PeriodSummary[];
  current: { year: number; month: number };
  canStartNext: boolean;
}) {
  const suffix = useTabSuffix();
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const upcoming =
    current.month === 12 ? { year: current.year + 1, month: 1 } : { year: current.year, month: current.month + 1 };
  const index = periods.findIndex((p) => p.year === current.year && p.month === current.month);
  const prev = index > 0 ? periods[index - 1] : undefined;
  const next = index !== -1 ? periods[index + 1] : undefined;
  const href = (p: PeriodSummary) => `/periods/${p.year}/${p.month}${suffix}`;

  return (
    <div className="flex items-center gap-1">
      {prev && (
        <Button variant="ghost" size="icon-sm" aria-label="Previous month" nativeButton={false} render={<Link href={href(prev)} />}>
          <ChevronLeft />
        </Button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label="Choose month"
          className="cursor-pointer rounded-lg px-1.5 py-0.5 text-xl font-semibold tracking-tight transition-colors outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-zinc-100"
        >
          {monthLabel(current.year, current.month)}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 gap-0 p-1">
          <ul>
            {periods.toReversed().map((p) => {
              const active = p.year === current.year && p.month === current.month;
              return (
                <li key={p.id}>
                  <Link
                    href={href(p)}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-zinc-100",
                      active && "font-medium text-amber-700",
                    )}
                  >
                    {monthLabel(p.year, p.month)}
                    {active && <Check className="size-4" />}
                  </Link>
                </li>
              );
            })}
          </ul>
          {canStartNext && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setStarting(true);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md border-t px-2.5 pt-2 pb-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-zinc-100 hover:text-foreground"
            >
              <CalendarPlus className="size-4" />
              Start {monthLabel(upcoming.year, upcoming.month)}
            </button>
          )}
        </PopoverContent>
      </Popover>
      {canStartNext && (
        <StartNextMonthDialog
          label={monthLabel(upcoming.year, upcoming.month)}
          open={starting}
          onOpenChange={setStarting}
        />
      )}
      {next && (
        <Button variant="ghost" size="icon-sm" aria-label="Next month" nativeButton={false} render={<Link href={href(next)} />}>
          <ChevronRight />
        </Button>
      )}
    </div>
  );
}

function StartNextMonthDialog({
  label,
  open,
  onOpenChange,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        setError(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start {label}?</DialogTitle>
          <DialogDescription>
            Creates {label} with the same bill columns (at ₱0, ready for the new amounts), the same split modes and
            points, and everyone currently in the household. Unpaid balances carry over.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await startNextMonth();
                if (result?.ok) {
                  onOpenChange(false);
                  if (result.redirectTo) router.push(result.redirectTo);
                } else if (result) setError(result.error);
              })
            }
          >
            {pending ? "Starting…" : `Start ${label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
