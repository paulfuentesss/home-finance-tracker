import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Pieces shared by the Trends tab's server part (components/trends.tsx) and its Where it went
// card (components/trends-breakdown.tsx, a Client Component), so no "use client" here.

/** "+12%", "−5%", "0%". */
export function pct(change: number) {
  return change > 0 ? `+${change}%` : change < 0 ? `−${-change}%` : "0%";
}

/** Up or down vs the period before, in words with an arrow (never colour alone). */
export function Change({ change }: { change: number | null }) {
  if (change === null) return <span className="text-muted-foreground">—</span>;
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : null;
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums">
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {pct(change)}
    </span>
  );
}

/** A Trends card. `action` (phones only) takes the icon's place in the top right corner. */
export function Card({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {action && <div className="sm:hidden">{action}</div>}
        <Icon className={cn("size-4 text-muted-foreground", action && "hidden sm:block")} aria-hidden />
      </div>
      {children}
    </section>
  );
}
