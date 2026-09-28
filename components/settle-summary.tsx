import Link from "next/link";
import { formatPHP, type Centavos } from "@/lib/money";
import type { PeriodView, ViewMember } from "@/lib/periods";
import { cn } from "@/lib/utils";

type Entry = { member: ViewMember; balance: Centavos };

// "Who owes what" above the Split Table, readable on a phone where the wide table isn't.
// Everyone settles with the collector (docs/settlement-rules.md), so the others are grouped
// by direction (pays the collector / gets paid by the collector) and the collector's own
// Final is shown last as the net of the two, not as one more debt.
export function SettleSummary({ view }: { view: PeriodView }) {
  if (view.issue || view.rows.length === 0) return null;
  const rowOf = new Map(view.rows.map((r) => [r.memberId, r]));
  const collector = view.members.find((m) => m.isCollector);
  const collectorName = collector?.name ?? "the collector";

  const others: Entry[] = view.members
    .filter((m) => !m.isCollector)
    .map((m) => ({ member: m, balance: rowOf.get(m.id)?.balance ?? 0 }));
  const byAmount = (a: Entry, b: Entry) => Math.abs(b.balance) - Math.abs(a.balance);
  const payers = others.filter((e) => e.balance > 0).sort(byAmount);
  const receivers = others.filter((e) => e.balance < 0).sort(byAmount);
  const settled = others.filter((e) => e.balance === 0);

  const collects = payers.reduce((sum, e) => sum + e.balance, 0);
  const paysOut = receivers.reduce((sum, e) => sum - e.balance, 0);
  // The collector's Final is negative when they're owed. Flip it so positive means "receives".
  const collectorNet = collector ? -(rowOf.get(collector.id)?.balance ?? 0) : collects - paysOut;

  return (
    <section aria-labelledby="settle-summary" className="rounded-xl border bg-white p-4 shadow-xs">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="settle-summary" className="text-sm font-semibold">
          Who owes what
        </h2>
        <Link
          href={`/periods/${view.period.year}/${view.period.month}/settle`}
          className="text-xs font-medium text-amber-700 underline-offset-2 hover:underline"
        >
          Record payments →
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        Each person&apos;s Final, including last month&apos;s unsettled balance and payments recorded.
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:max-w-3xl">
        {payers.length > 0 && (
          <Group id="settle-pays" title={`Pays ${collectorName}`} total={collects} tone="owes" entries={payers} />
        )}
        {receivers.length > 0 && (
          <Group id="settle-gets" title={`${collectorName} pays`} total={paysOut} tone="gets" entries={receivers} />
        )}
      </div>

      <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground lg:max-w-3xl">
        {collector && (
          <p>
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <span className={cn("size-2 rounded-full", collector.dotClass)} aria-hidden />
              {collector.name}
            </span>{" "}
            {collectorNet === 0 ? (
              "breaks even overall"
            ) : (
              <>
                {collectorNet > 0 ? "receives" : "pays"}{" "}
                <span
                  className={cn(
                    "font-mono font-semibold tabular-nums",
                    collectorNet > 0 ? "text-emerald-600" : "text-rose-600",
                  )}
                >
                  {formatPHP(Math.abs(collectorNet))}
                </span>{" "}
                overall
              </>
            )}{" "}
            <span className="whitespace-nowrap">
              ({formatPHP(collects)} in − {formatPHP(paysOut)} out)
            </span>
          </p>
        )}
        {settled.length > 0 && (
          <p>
            <span className="font-medium text-zinc-600">Settled:</span>{" "}
            {settled.map((e) => e.member.name).join(", ")}
          </p>
        )}
      </div>
    </section>
  );
}

function Group({
  id,
  title,
  total,
  tone,
  entries,
}: {
  id: string;
  title: string;
  total: Centavos;
  tone: "owes" | "gets";
  entries: Entry[];
}) {
  const color = tone === "owes" ? "text-rose-600" : "text-emerald-600";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 px-2">
        <h3 id={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">{formatPHP(total)}</span>
      </div>
      <ul aria-labelledby={id} className="mt-1">
        {entries.map(({ member, balance }) => (
          <li key={member.id} className="flex items-center justify-between gap-2 px-2 py-1">
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className={cn("size-2 rounded-full", member.dotClass)} aria-hidden />
              {member.name}
            </span>
            <span className={cn("font-mono text-sm font-semibold tabular-nums", color)}>
              {formatPHP(Math.abs(balance))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
