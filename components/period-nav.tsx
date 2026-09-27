"use client";

import { ChevronLeft, ChevronRight, CalendarPlus, DollarSign, Layers, ReceiptText, Settings } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export function MonthPicker({
  periods,
  current,
}: {
  periods: PeriodSummary[];
  current: { year: number; month: number };
}) {
  const router = useRouter();
  const suffix = useTabSuffix();
  const index = periods.findIndex((p) => p.year === current.year && p.month === current.month);
  const go = (p: PeriodSummary | undefined) => p && router.push(`/periods/${p.year}/${p.month}${suffix}`);
  const items = periods.map((p) => ({ value: `${p.year}-${p.month}`, label: monthLabel(p.year, p.month) }));

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous month"
        disabled={index <= 0}
        onClick={() => go(periods[index - 1])}
      >
        <ChevronLeft />
      </Button>
      <Select
        items={items}
        value={`${current.year}-${current.month}`}
        onValueChange={(value) => go(periods.find((p) => `${p.year}-${p.month}` === value))}
      >
        <SelectTrigger
          aria-label="Choose month"
          className="h-auto border-none px-1 text-xl font-semibold tracking-tight shadow-none"
        >
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
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next month"
        disabled={index === -1 || index >= periods.length - 1}
        onClick={() => go(periods[index + 1])}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

export function StartNextMonthButton() {
  const router = useRouter();
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
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <CalendarPlus />
        Start next month
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start the next month?</DialogTitle>
          <DialogDescription>
            Creates the next month with the same bill columns (at ₱0, ready for this month&apos;s amounts), the same
            split modes and points, and everyone currently in the household. Unpaid balances carry over.
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
                  setOpen(false);
                  if (result.redirectTo) router.push(result.redirectTo);
                } else if (result) setError(result.error);
              })
            }
          >
            {pending ? "Starting…" : "Start next month"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
