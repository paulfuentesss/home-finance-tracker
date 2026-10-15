"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, useActiveTooltipLabel, XAxis, YAxis } from "recharts";
import { seriesColor as colorOf } from "@/components/trends-colors";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatPHP } from "@/lib/money";
import type { Series, TrendsMonth } from "@/lib/trends";

/** The widest a bar gets (px); the tooltip sits clear of it. */
const MAX_BAR = 72;

const shortMonth = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" });
const compactPHP = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** One bar: the month's short name ("Sep", unique within a range), its total and `s0…sN`. */
type Datum = { name: string; complete: boolean; total: number } & Record<`s${number}`, number>;

/**
 * Trends tab: one stacked bar per month, a block per series (biggest at the bottom). A month still
 * in progress is drawn faded with "so far" under it. The Where it went table is its text version.
 * Desktop shows a bar's amounts in a tooltip beside it; on a phone that box would cover the
 * chart, so a tapped bar's amounts show in a panel under the chart instead.
 */
export function TrendsChart({ months, series, label }: { months: TrendsMonth[]; series: Series[]; label: string }) {
  // Series keys ("bill:PLDT Wifi") can't be CSS variable names, so the chart uses s0, s1, ….
  const config = useMemo(
    () => Object.fromEntries(series.map((s, i) => [`s${i}`, { label: s.label, color: colorOf(s) }])) satisfies ChartConfig,
    [series],
  );
  const data = useMemo(
    () =>
      months.map(
        (m) =>
          ({
            name: shortMonth.format(Date.UTC(m.year, m.month - 1, 1)),
            complete: m.complete,
            total: m.total,
            ...Object.fromEntries(series.map((s, i) => [`s${i}`, m.values[s.key] ?? 0])),
          }) as Datum,
      ),
    [months, series],
  );

  // The phone panel's month: the last one tapped while it's still in the range, else the newest
  // complete month (a "so far" one is nearly empty), else the newest.
  const [picked, setPicked] = useState<string | null>(null);
  const shown =
    data.find((d) => d.name === picked) ?? data.findLast((d) => d.complete) ?? data[data.length - 1];

  return (
    <div>
      <div role="img" aria-label={label}>
        <ChartContainer config={config} className="aspect-auto h-72 w-full sm:h-80">
          {/* Recharts stacks bars in the order they first mounted, so a series added by a range
              switch would land on top. A new key per series list redraws the chart in order. */}
          <BarChart
            key={series.map((s) => s.key).join("|")}
            data={data}
            margin={{ top: 8, right: 4, left: 4, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} height={40} tick={<MonthTick inProgress={data.map((d) => !d.complete)} />}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => compactPHP.format(v / 100)}
              className="tabular-nums"
            />
            {/* Beside the bar, not over it: Recharts anchors the tooltip at the bar's centre, so the
                offset clears half the widest bar. Pinned to the top so it doesn't follow the mouse
                up and down, and not animated (it would glide across from the last bar). Hidden on
                a phone, where it stays mounted only to track the tapped bar and highlight it. */}
            <ChartTooltip
              cursor={{ fillOpacity: 0.4 }}
              content={<MonthTooltip series={series} />}
              offset={MAX_BAR / 2 + 12}
              position={{ y: 0 }}
              isAnimationActive={false}
            />
            <ActiveMonth onChange={setPicked} />
            <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={`s${i}`}
                stackId="spending"
                fill={`var(--color-s${i})`}
                stroke="#fff"
                strokeWidth={1}
                maxBarSize={MAX_BAR}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              >
                {data.map((d) => (
                  <Cell key={d.name} fillOpacity={d.complete ? 1 : 0.4} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
      </div>
      {/* Outside the role="img" wrapper, so screen readers can read it too. */}
      {shown && (
        <div aria-live="polite" className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm sm:hidden">
          {/* A new key per month replays the fade on each tap; the live region itself stays put
              (one that's re-created isn't read out). */}
          <div key={shown.name} className="grid gap-1.5 animate-in fade-in duration-200">
            <MonthAmounts datum={shown} series={series} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Tells the chart which month the tooltip is on (tapped, a finger dragged across the bars, hovered
 * or picked with the keyboard). Follows Recharts' own tooltip state rather than `onClick`, which
 * fires before Recharts has caught up with a tap and can report the bar tapped before. Draws nothing.
 */
function ActiveMonth({ onChange }: { onChange: (name: string) => void }) {
  const label = useActiveTooltipLabel();
  useEffect(() => {
    if (label !== undefined) onChange(String(label));
  }, [label, onChange]);
  return null;
}

/** The month under its bar, with "so far" under one that's still in progress (`inProgress` by bar). */
function MonthTick({
  x = 0,
  y = 0,
  payload,
  inProgress = [],
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value: string; index: number };
  inProgress?: boolean[];
}) {
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={12} textAnchor="middle" className="fill-muted-foreground text-xs">
        {payload?.value}
      </text>
      {payload && inProgress[payload.index] && (
        <text dy={26} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          so far
        </text>
      )}
    </g>
  );
}

/** A month's blocks with something in them, biggest first. */
function monthRows(datum: Datum, series: Series[]) {
  return series
    .map((s, index) => ({ index, value: datum[`s${index}`] ?? 0 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** A month's name, each block's amount and the total: the tooltip's and the phone panel's content. */
function MonthAmounts({ datum, series }: { datum: Datum; series: Series[] }) {
  const rows = monthRows(datum, series);
  return (
    <>
      <p className="font-medium">
        {datum.name}
        {!datum.complete && <span className="font-normal text-muted-foreground"> · so far</span>}
      </p>
      {rows.length ? (
        rows.map(({ index, value }) => (
          <div key={index} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: colorOf(series[index]) }} />
            <span className="flex-1 text-muted-foreground">{series[index].label}</span>
            <span className="font-mono font-medium tabular-nums">{formatPHP(value)}</span>
          </div>
        ))
      ) : (
        <p className="text-muted-foreground">Nothing spent yet.</p>
      )}
      <div className="flex items-center justify-between border-t pt-1.5 font-medium">
        Total
        <span className="font-mono tabular-nums">{formatPHP(datum.total)}</span>
      </div>
    </>
  );
}

interface TooltipEntry {
  payload?: Datum;
}

/** Hovering a bar (desktop): its amounts beside it. */
function MonthTooltip({ active, payload, series }: { active?: boolean; payload?: TooltipEntry[]; series: Series[] }) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;
  return (
    <div className="hidden min-w-44 gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl sm:grid">
      <MonthAmounts datum={datum} series={series} />
    </div>
  );
}
