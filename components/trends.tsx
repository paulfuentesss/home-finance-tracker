import { ArrowDownRight, ArrowUpRight, ChartColumn, Lightbulb, ListOrdered } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { TrendsChart } from "@/components/trends-chart";
import { seriesColor } from "@/components/trends-colors";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { monthLabel } from "@/lib/format";
import { formatPHP } from "@/lib/money";
import { RANGES, spanLabel, type Insight, type Trends as TrendsData } from "@/lib/trends";
import { cn } from "@/lib/utils";

/** "+12%", "−5%", "0%". */
function pct(change: number) {
  return change > 0 ? `+${change}%` : change < 0 ? `−${-change}%` : "0%";
}

/** Up or down vs the period before, in words with an arrow (never colour alone). */
function Change({ change }: { change: number | null }) {
  if (change === null) return <span className="text-muted-foreground">—</span>;
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : null;
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums">
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {pct(change)}
    </span>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof ChartColumn; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-xs">
      <h2 className="flex items-center justify-between font-semibold">
        {title}
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </h2>
      {children}
    </section>
  );
}

// Tab: Spending Trends (docs/features/trends.md). The household's spending over the last 1, 3 or
// 6 months up to the month picked, what it went on, and insights worked out by lib/trends.ts.
export function Trends({ trends, base }: { trends: TrendsData; base: string }) {
  const { months, series, basis, headline, breakdown, insights, range, latestComplete, skipped } = trends;
  const inProgress = months.filter((m) => !m.complete);
  const chartLabel = `Stacked bar chart of household spending per month, ${spanLabel(months)}. The Where it went table below lists the same amounts.`;

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              {basis.partial ? "So far in" : "Spent in"} {basis.label}
            </p>
            <p className="text-2xl font-semibold tracking-tight">{formatPHP(headline.total)}</p>
            {basis.months > 1 && (
              <p className="text-sm text-muted-foreground">{formatPHP(headline.average)} a month on average</p>
            )}
            {headline.previous && (
              <p className="mt-1 text-sm">
                {headline.previous.change === null ? (
                  <>Nothing was spent in {headline.previous.label} to compare with.</>
                ) : (
                  <>
                    A month here is <Change change={headline.previous.change} /> vs {headline.previous.label} (
                    {formatPHP(headline.previous.average)} a month).
                  </>
                )}
              </p>
            )}
          </div>
          <nav aria-label="How many months" className="flex rounded-lg bg-zinc-100 p-0.5 text-sm">
            {RANGES.map((n) => (
              <Link
                key={n}
                href={`${base}/trends?range=${n}`}
                aria-current={n === range ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  n === range ? "bg-white text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {n === 1 ? "1 month" : `${n} months`}
              </Link>
            ))}
          </nav>
        </div>

        {skipped.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {spanLabel(skipped)}&apos;s bills aren&apos;t all in yet, so this shows {basis.label}, the latest month
            that&apos;s complete.
          </p>
        )}
        {months.length < range && (
          <p className="text-sm text-muted-foreground">
            Only {months.length} {months.length === 1 ? "month" : "months"} so far.
          </p>
        )}
        {series.length ? (
          <TrendsChart months={months} series={series} label={chartLabel} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing spent yet in {spanLabel(months)}.</p>
        )}
        {inProgress.length > 0 && !basis.partial && (
          <p className="text-xs text-muted-foreground">
            {spanLabel(inProgress)} is still coming in (faded): its bills usually arrive after it ends, so it&apos;s
            left out of the totals and insights until they&apos;re in.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Insights" icon={Lightbulb}>
          {basis.partial ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Insights appear once a month&apos;s bills are all in.
              {latestComplete && (
                <>
                  {" "}
                  <Link
                    href={`/periods/${latestComplete.year}/${latestComplete.month}/trends?range=${range}`}
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    See {monthLabel(latestComplete.year, latestComplete.month)}
                  </Link>
                </>
              )}
            </p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {insights.map((insight) => (
                <li key={insight.kind} className="rounded-lg bg-zinc-50 p-3">
                  <InsightText insight={insight} basisLabel={basis.label} />
                </li>
              ))}
              {!headline.previous && (
                <li className="text-muted-foreground">
                  Comparisons appear once there are months before {spanLabel(months)} to compare with.
                </li>
              )}
            </ul>
          )}
        </Card>

        <Card title="Where it went" icon={ListOrdered}>
          <p className="mt-1 text-xs text-muted-foreground">
            {basis.label}
            {headline.previous && <> · change per month vs {headline.previous.label}</>}
          </p>
          {breakdown.length ? (
            <Table className="mt-2 text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>What</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  {basis.months > 1 && <TableHead className="hidden text-right sm:table-cell">Per month</TableHead>}
                  {headline.previous && <TableHead className="text-right">Change</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: seriesColor(row) }} />
                        {row.label}
                        {row.kind === "advance" && <span className="text-xs text-muted-foreground">shared</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatPHP(row.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.share}%</TableCell>
                    {basis.months > 1 && (
                      <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                        {formatPHP(row.average)}
                      </TableCell>
                    )}
                    {headline.previous && (
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
      </div>
    </div>
  );
}

function InsightText({ insight, basisLabel }: { insight: Insight; basisLabel: string }) {
  switch (insight.kind) {
    case "top":
      return (
        <p>
          <strong>{insight.label}</strong> was the biggest spend: {insight.share}% of everything in {basisLabel} (
          {formatPHP(insight.total)}).
        </p>
      );
    case "mover":
      return (
        <p>
          <strong>{insight.label}</strong> grew the most: {formatPHP(insight.increase)} more a month than in{" "}
          {insight.previousLabel}
          {insight.change === null ? ", where there was none." : ` (${pct(insight.change)}).`}
        </p>
      );
    case "rising":
      return (
        <p>
          <strong>{insight.label}</strong> in {insight.monthLabel} was {pct(insight.change)} above its usual:{" "}
          {formatPHP(insight.latest)} vs about {formatPHP(insight.usual)}.
        </p>
      );
    case "purchases":
      return (
        <div>
          <p>Biggest single purchases:</p>
          <ol className="mt-1.5 space-y-1">
            {insight.items.map((item, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">
                  {item.description}{" "}
                  <span className="text-xs text-muted-foreground">{spanLabel([item])}</span>
                </span>
                <span className="font-mono font-medium tabular-nums">{formatPHP(item.amount)}</span>
              </li>
            ))}
          </ol>
        </div>
      );
    case "perPerson":
      return (
        <p>
          About <strong>{formatPHP(insight.average)}</strong> per person a month.
        </p>
      );
  }
}
