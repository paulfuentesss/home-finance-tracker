import { formatPHP } from "@/lib/money";
import type { PeriodView } from "@/lib/periods";
import { cn } from "@/lib/utils";

// "Who owes what" above the Split Table: each person's Final in one line, readable on a
// phone where the wide table isn't. Everyone settles with the collector (docs/settlement-rules.md).
export function SettleSummary({ view }: { view: PeriodView }) {
  if (view.issue || view.rows.length === 0) return null;
  const rowOf = new Map(view.rows.map((r) => [r.memberId, r]));
  const collector = view.members.find((m) => m.isCollector);
  const collectorName = collector?.name ?? "the collector";

  return (
    <section aria-labelledby="settle-summary" className="rounded-xl border bg-white p-4 shadow-xs">
      <h2 id="settle-summary" className="text-sm font-semibold">
        Who owes what
      </h2>
      <p className="text-xs text-muted-foreground">Each person&apos;s Final, including last month&apos;s unsettled balance.</p>
      <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
        {view.members.map((m) => {
          const balance = rowOf.get(m.id)?.balance ?? 0;
          const owes = balance > 0;
          const direction =
            balance === 0
              ? "Settled, nothing to do"
              : `${owes ? "To pay" : "To receive"}${
                  m.isCollector ? ", net across everyone" : owes ? ` to ${collectorName}` : ` from ${collectorName}`
                }`;
          return (
            <li key={m.id} className="rounded-lg border bg-zinc-50/60 px-3 py-2 transition-colors hover:border-amber-300">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className={cn("size-2 rounded-full", m.dotClass)} aria-hidden />
                {m.name}
              </p>
              <p
                className={cn(
                  "mt-0.5 font-mono text-sm font-semibold tabular-nums",
                  balance === 0 ? "text-zinc-500" : owes ? "text-rose-600" : "text-emerald-600",
                )}
              >
                {formatPHP(Math.abs(balance))}
              </p>
              <p className="text-[11px] text-muted-foreground">{direction}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
