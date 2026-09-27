// Grey placeholder blocks shown while a month loads (app/periods/**/loading.tsx).
import { cn } from "@/lib/utils";

function Block({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-zinc-200/70", className)} />;
}

/** The month header: title, the two totals, and the tab strip. */
export function HeaderSkeleton() {
  return (
    <header className="border-b bg-white" aria-hidden>
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <Block className="size-11 rounded-xl" />
          <div className="space-y-2">
            <Block className="h-3.5 w-20" />
            <Block className="h-6 w-40" />
          </div>
        </div>
        <div className="flex gap-2">
          <Block className="h-11 w-32 rounded-lg" />
          <Block className="h-11 w-32 rounded-lg" />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-7xl gap-4 px-4 pb-3">
        {["w-36", "w-40", "w-44", "w-44"].map((width, i) => (
          <Block key={i} className={cn("h-5", width)} />
        ))}
      </div>
    </header>
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
