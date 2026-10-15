import { Lightbulb } from "lucide-react";
import Link from "next/link";
import { WhereItWent } from "@/components/trends-breakdown";
import { TrendsChart } from "@/components/trends-chart";
import { Card, Change, pct } from "@/components/trends-parts";
import { monthLabel } from "@/lib/format";
import { formatPHP } from "@/lib/money";
import { RANGES, spanLabel, type Insight, type Trends as TrendsData } from "@/lib/trends";
import { cn } from "@/lib/utils";

// Tab: Spending Trends (docs/features/trends.md). The household's spending over the last 1, 3 or
// 6 months up to the month picked, what it went on (components/trends-breakdown.tsx), and
// insights worked out by lib/trends.ts.
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

      {/* grid-cols-1, not the default auto column: that one grows to the table's no-wrap width and
          pushes both cards off a phone screen. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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

        <WhereItWent
          rows={breakdown}
          basisLabel={basis.label}
          months={basis.months}
          previousLabel={headline.previous?.label}
        />
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
          <ol className="mt-2 space-y-2 sm:mt-1.5 sm:space-y-1">
            {insight.items.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-3 sm:items-baseline">
                {/* On a phone the month goes on its own line under the name, the amount beside
                    both, so the whole name fits; wider screens keep it on one line. A very long
                    name still shortens with "…", never the month. */}
                <span className="min-w-0 sm:flex sm:items-baseline sm:gap-1.5">
                  <span className="block truncate">{item.description}</span>
                  <span className="block text-xs text-muted-foreground sm:shrink-0">{spanLabel([item])}</span>
                </span>
                <span className="shrink-0 font-mono font-medium tabular-nums">{formatPHP(item.amount)}</span>
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
