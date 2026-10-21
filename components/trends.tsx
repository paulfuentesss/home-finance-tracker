"use client";

import { Lightbulb } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, type RefObject } from "react";
import { WhereItWent } from "@/components/trends-breakdown";
import { TrendsChart } from "@/components/trends-chart";
import { Card, Change, pct } from "@/components/trends-parts";
import { monthLabel } from "@/lib/format";
import { formatPHP } from "@/lib/money";
import {
  DEFAULT_RANGE,
  parseRange,
  RANGES,
  spanLabel,
  type Insight,
  type Range,
  type Trends as TrendsData,
} from "@/lib/trends";
import { cn } from "@/lib/utils";

/**
 * Sets `?range=` (or, for the default, removes it) with the native replaceState, which Next picks
 * up in useSearchParams without fetching the page again (node_modules/next/dist/docs: Linking and
 * Navigating → Native History API). Compares the raw value, so a junk one is cleaned up too.
 */
function setRange(range: Range) {
  const url = new URL(window.location.href);
  if (range === DEFAULT_RANGE) {
    if (!url.searchParams.has("range")) return;
    url.searchParams.delete("range");
  } else {
    if (url.searchParams.get("range") === String(range)) return;
    url.searchParams.set("range", String(range));
  }
  window.history.replaceState(null, "", url);
}

/** Fades `ref`'s element in again whenever `value` changes (not on the first render). */
function useFadeOnChange(ref: RefObject<HTMLElement | null>, value: unknown) {
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    ref.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
  }, [ref, value]);
}

// Tab: Spending Trends (docs/features/trends.md). The household's spending over the last 1, 3 or
// 6 months up to the month picked, what it went on (components/trends-breakdown.tsx), and
// insights worked out by lib/trends.ts. The page sends all three ranges; the one shown comes from
// `?range=` (like the Advances Log's column filter, docs/decisions.md), so switching is instant:
// the highlight slides and the numbers fade over, with no reload.
export function Trends({ byRange }: { byRange: Record<Range, TrendsData> }) {
  const range = parseRange(useSearchParams().get("range"));
  const { months, series, basis, headline, breakdown, insights, latestComplete, skipped } = byRange[range];
  const headlineRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  useFadeOnChange(headlineRef, range);
  useFadeOnChange(cardsRef, range);
  const inProgress = months.filter((m) => !m.complete);
  const chartLabel = `Stacked bar chart of household spending per month, ${spanLabel(months)}. The Where it went table below lists the same amounts.`;

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div ref={headlineRef}>
            <p className="text-sm text-muted-foreground">
              {basis.partial ? "So far in" : "Spent in"} {basis.label}
            </p>
            <p className="text-2xl font-semibold tracking-tight">{formatPHP(headline.total)}</p>
            {basis.months > 1 && (
              <p className="text-sm text-muted-foreground">{formatPHP(headline.average)} a month on average</p>
            )}
            {/* Here rather than under the chart, so the months the headline names make sense next
                to the range picked. */}
            {inProgress.length > 0 && !basis.partial && (
              <p className="mt-1 text-xs text-muted-foreground">
                {spanLabel(inProgress)} {inProgress.length === 1 ? "isn't" : "aren't"} counted yet:{" "}
                {inProgress.length === 1 ? "its" : "their"} bills are still coming in (faded in the chart).
              </p>
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
          {/* Three equal thirds, so the white pill (a third, less the padding) slides across by its
              own width per step. Reduced motion: it jumps. */}
          <div
            role="group"
            aria-label="How many months"
            className="relative grid w-full grid-cols-3 rounded-lg bg-zinc-100 p-0.5 text-sm sm:w-auto"
          >
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-md bg-white shadow-xs transition-transform duration-200 ease-out motion-reduce:transition-none",
                range === RANGES[1] && "translate-x-full",
                range === RANGES[2] && "translate-x-[200%]",
              )}
            />
            {RANGES.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={n === range}
                onClick={() => setRange(n)}
                className={cn(
                  "relative rounded-md px-3 py-1.5 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  n === range ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {n === 1 ? "1 month" : `${n} months`}
              </button>
            ))}
          </div>
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
      </section>

      {/* grid-cols-1, not the default auto column: that one grows to the table's no-wrap width and
          pushes both cards off a phone screen. Where it went first: it's the page's main answer.
          items-start, so opening its rows doesn't stretch Insights beside it. */}
      <div ref={cardsRef} className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <WhereItWent
          rows={breakdown}
          basisLabel={basis.label}
          months={basis.months}
          previousLabel={headline.previous?.label}
        />

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
                  {/* The period compared with is the one before the range's first month. */}
                  Comparisons appear once there are months before {monthLabel(months[0].year, months[0].month)} to
                  compare with.
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/** "₱16,122": for an "about" figure, where centavos are noise. Display only. */
const wholePHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });

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
          About <strong>{wholePHP.format(insight.average / 100)}</strong> per person a month.
        </p>
      );
  }
}
