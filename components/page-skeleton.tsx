// Grey placeholder blocks shown while a month loads (app/periods/**/loading.tsx).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function Block({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-zinc-200/70", className)} />;
}

/**
 * The month layout's frame while a month loads: the dark sidebar on desktop, the slim top bar
 * on phones, and the header (section name, the two totals). Same sizes as
 * components/app-sidebar.tsx and components/period-header.tsx, so nothing jumps when the month
 * arrives. `children` goes where the page's content will be.
 */
export function ShellSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 space-y-5 bg-zinc-900 px-3 py-4 lg:block" aria-hidden>
        <div className="flex items-center gap-3 px-1">
          <div className="size-11 rounded-xl bg-white/10" />
          <div className="h-4 w-20 rounded-md bg-white/10" />
        </div>
        <div className="h-9 animate-pulse rounded-lg bg-white/5" />
        <div className="space-y-2 px-3 pt-2">
          {["w-28", "w-24", "w-32", "w-24", "w-28", "w-36", "w-20"].map((width, i) => (
            <div key={i} className={cn("h-6 animate-pulse rounded-md bg-white/10", width)} />
          ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 border-b bg-white px-2 py-2 lg:hidden" aria-hidden>
          <Block className="size-9 rounded-lg" />
          <Block className="size-11 rounded-xl" />
          <Block className="h-6 w-28" />
        </div>
        <header className="border-b bg-white" aria-hidden>
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4">
            <div className="space-y-2">
              <Block className="h-3.5 w-24" />
              <Block className="h-6 w-48" />
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Block className="h-12 rounded-lg sm:w-32" />
              <Block className="h-12 rounded-lg sm:w-32" />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-8">{children}</main>
      </div>
    </div>
  );
}

/** A card with a table-like body: what every tab's content roughly looks like. */
export function ContentSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <Block className="h-28 rounded-xl" />
      <div className="space-y-3 rounded-xl border bg-white p-5 shadow-xs">
        <Block className="h-8 w-full" />
        {Array.from({ length: 6 }, (_, i) => (
          <Block key={i} className="h-6 w-full" />
        ))}
      </div>
    </div>
  );
}
