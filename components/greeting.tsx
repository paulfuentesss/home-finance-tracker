"use client";

import Link from "next/link";
import { useViewer } from "@/components/viewer-context";
import type { PartOfDay } from "@/lib/format";
import { HOUSE_BUDGET_LABEL } from "@/lib/household-config";
import { formatPHP } from "@/lib/money";
import { isViewOnly } from "@/lib/permissions";
import type { PeriodView } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { collectorNetOf } from "@/lib/who-owes";

const HELLO: Record<PartOfDay, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};
const ICON: Record<PartOfDay, string> = { morning: "☀️", afternoon: "🌤️", evening: "🌙" };

interface Theme {
  /** The card: background gradient and border. */
  card: string;
  /** The sun or moon glow in the top-right corner. */
  glow: string;
  heading: string;
  text: string;
  amount: string;
  link: string;
}

// The card looks like the time of day: a sunrise, a clear sky, a night with stars. Class names
// are written out in full so Tailwind can find them. Static: nothing moves.
const THEME: Record<PartOfDay, Theme> = {
  morning: {
    card: "border-amber-200 bg-linear-to-r from-amber-100 via-orange-50 to-sky-100",
    glow: "bg-amber-300/50",
    heading: "text-zinc-900",
    text: "text-zinc-600",
    amount: "text-zinc-900",
    link: "text-amber-700",
  },
  afternoon: {
    card: "border-sky-200 bg-linear-to-r from-sky-200 via-sky-100 to-white",
    glow: "bg-yellow-200/70",
    heading: "text-zinc-900",
    text: "text-zinc-600",
    amount: "text-zinc-900",
    link: "text-amber-700",
  },
  evening: {
    card: "border-indigo-900 bg-linear-to-r from-indigo-950 via-slate-900 to-indigo-900",
    glow: "bg-indigo-200/20",
    heading: "text-white",
    text: "text-indigo-100/80",
    amount: "text-white",
    link: "text-amber-300",
  },
};

/** A few small stars at fixed spots for the night card, as background dots (no image files). */
const STARS = [
  [8, 20],
  [22, 70],
  [38, 30],
  [55, 80],
  [63, 18],
  [74, 55],
  [86, 28],
  [93, 75],
]
  .map(([x, y], i) => {
    // Every third star a little bigger, so they don't look like a grid.
    const size = i % 3 === 0 ? 1.5 : 1;
    return `radial-gradient(${size}px ${size}px at ${x}% ${y}%, rgb(255 255 255 / 0.8), transparent)`;
  })
  .join(", ");

/**
 * The top of the Split Table: hello to whoever the page is drawn for (the signed-in member, or
 * the housemate PA is previewing as), with their emoji and their own number in plain words, on a
 * card that looks like the time of day. A housemate sees what they still have to pay or get back
 * (view.payables, the same as the bill banner and email); the collector, the "overall" number Who
 * owes what shows (lib/who-owes.ts). `partOfDay` comes from the server, so the page and the
 * browser agree.
 */
export function Greeting({ view, partOfDay }: { view: PeriodView; partOfDay: PartOfDay }) {
  const viewer = useViewer();
  const me = view.members.find((m) => m.id === viewer.memberId);
  // Their emoji, big, before the hello. None set: nothing (a big colour dot would look odd).
  const emoji = me?.emoji ?? viewer.emoji;
  const theme = THEME[partOfDay];

  return (
    <section
      aria-label="Greeting"
      className={cn("relative flex items-center gap-5 overflow-hidden rounded-xl border p-5 shadow-xs sm:p-6", theme.card)}
    >
      {/* The sun or moon glow, and at night the stars: behind everything, decoration only. */}
      <span
        className={cn("pointer-events-none absolute -top-10 -right-10 size-40 rounded-full blur-2xl", theme.glow)}
        aria-hidden
      />
      {partOfDay === "evening" && (
        <span className="pointer-events-none absolute inset-0" style={{ backgroundImage: STARS }} aria-hidden />
      )}
      {emoji && (
        <span className="relative text-5xl leading-none" aria-hidden>
          {emoji}
        </span>
      )}
      <div className="relative min-w-0 space-y-1.5">
        <p className={cn("text-lg leading-snug font-semibold", theme.heading)}>
          {HELLO[partOfDay]},{" "}
          {/* The name and the sun/moon wrap together, so the icon never sits alone on a line. */}
          <span className="whitespace-nowrap">
            {viewer.name}
            <span className="ml-1.5 inline-block" aria-hidden>
              {ICON[partOfDay]}
            </span>
          </span>
        </p>
        {isViewOnly(viewer) ? (
          // Family who only look have no number: a warm line instead.
          <p className={cn("text-sm leading-relaxed", theme.text)}>Hope you&apos;re doing well wherever you are! 💛</p>
        ) : (
          <YourNumber view={view} memberId={me?.id ?? null} theme={theme} />
        )}
      </div>
    </section>
  );
}

function YourNumber({ view, memberId, theme }: { view: PeriodView; memberId: number | null; theme: Theme }) {
  const text = cn("text-sm leading-relaxed", theme.text);
  // Someone in no month (a view-only login) or a month that can't be worked out: just the hello.
  if (memberId === null || view.issue || view.rows.length === 0) return null;
  // A closed month's Finals become the next month's Prev Month Unsettled, so they're paid there.
  if (view.period.status === "closed") return <p className={text}>This month is closed.</p>;

  const rowOf = new Map(view.rows.map((r) => [r.memberId, r]));
  const collector = view.members.find((m) => m.isCollector);
  const amount = (centavos: number) => (
    <span className={cn("font-mono font-semibold tabular-nums", theme.amount)}>{formatPHP(Math.abs(centavos))}</span>
  );

  if (collector?.id === memberId) {
    const net = collectorNetOf(
      rowOf.get(collector.id)?.balance ?? 0,
      view.houseBudget.balance,
      view.members.filter((m) => !m.isCollector).map((m) => rowOf.get(m.id)?.balance ?? 0),
    );
    return (
      <p className={text}>
        {/* "Get back": the collector paid the bills upfront. "Overall": it includes carry-over
            and what the House Budget holds, not just this month. */}
        {net === 0 ? "You break even overall." : <>You {net > 0 ? "get back" : "pay"} {amount(net)} overall.</>}
      </p>
    );
  }

  // What's still to pay, not the bare Final: a waiting "I paid" or a payment made in a later
  // month is already taken off (the same as the bill banner), so nobody is asked to pay twice.
  const payables = view.payables[String(memberId)];
  if (!payables) return null;
  if (payables.kind === "settled") return <p className={text}>You&apos;re all settled 🎉</p>;
  if (payables.kind === "owed") {
    return (
      <p className={text}>
        The {HOUSE_BUDGET_LABEL} pays you {amount(payables.amount)}.
      </p>
    );
  }
  const { waiting, left } = payables;
  // Named like the bill banner does (housemateNotice), so the two read the same.
  const confirmer = collector?.name ?? "the admin";
  // Their latest confirmed payment, from any month. None on record: no line (payments from before
  // the app aren't in it, so "never paid" could be wrong).
  const lastPaid = view.lastPaid[String(memberId)];
  return (
    <p className={text}>
      {left > 0 ? (
        <>
          You have {amount(left)} left to pay into the {HOUSE_BUDGET_LABEL}
          {waiting > 0 && <> ({amount(waiting)} already sent, waiting for {confirmer} to confirm)</>}.{" "}
          {/* "I paid" goes in the latest month, whichever month this is. */}
          <Link
            href={view.latestSettleHref}
            className={cn("font-medium whitespace-nowrap underline-offset-2 hover:underline", theme.link)}
          >
            Settle up →
          </Link>
          {lastPaid && (
            <span className="mt-0.5 block text-xs">
              Last paid {lastPaid.label}
              {lastPaid.monthsAgo > 0 && ` · ${lastPaid.monthsAgo} month${lastPaid.monthsAgo === 1 ? "" : "s"} ago`}
            </span>
          )}
        </>
      ) : (
        // No amount: `waiting` is capped at what's due, so it could be less than what was sent.
        <>Your payment is waiting for {confirmer} to confirm.</>
      )}
    </p>
  );
}
