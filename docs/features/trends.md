# Spending Trends

## Status
✅ Working.

## What it does
- **Trends tab** (Household group in the sidebar, everyone sees it, view-only logins included):
  the household's spending over the last **1, 3 or 6 months** (default 3), ending at the month
  picked in the sidebar, so browsing back shows how things looked then. Fewer months than the
  range → it shows what there is ("Only 2 months so far"). **1 month** on a month still coming
  in (usually the current one) shows the newest complete month instead, and says so: on its own
  the current month would be nearly empty. 3 and 6 show it faded. Switching range is instant (no
  reload): the highlight slides (it jumps with reduced motion) and the numbers fade over. The
  range is kept in the address bar (`?range=1|6`, none for 3), so a refresh or link keeps it;
  Back leaves the tab rather than stepping through ranges.
- **Spending** = the month's confirmed bills (the Helper's included) + its shared advances: the
  same two totals as the month header, so a bar's total matches its month. Pending (emailed)
  bills, settle-up payments and Helper entries (already in the Helper bill) don't count.
- **Stacked bar chart**: a bar per month, a colour block per bill (by column name) and per
  advance category (Grocery, Food, Service, Misc). Hover a bar for each block's amount and the
  month's total; on a phone (where that box would cover the chart) tap a bar and they show
  under the chart instead, starting on the newest complete month. At most eight blocks; the
  smallest of the rest fold into **Other**.
  A series keeps its colour whatever the range. The blocks stack biggest first (at the bottom),
  in the same order as the legend and the Where it went table, worked out from the complete
  months so a month still coming in can't reorder them.
- **Complete months only** feed the totals, the table and the insights. A month is complete
  once it's closed, or once it has ended with no bill pending and no bill still at ₱0 (the
  Helper's ₱0 just means no visits). Others show faded with "so far": bills arrive after their
  month ends, so a half-filled month would look like spending dropped. A range with no complete
  month shows its numbers so far, no insights, and a link to the newest month that has them.
- The page header leaves out the month's two totals here (they're one month's, beside a page
  about several).
- **Headline**: what was spent and the monthly average, and how an average month compares
  with the period of the same length before (when it has complete months).
- **Insights** (worked out by the app, nothing sent anywhere): the biggest spend and its share;
  what grew most per month vs the period before; a bill well above its usual in the latest
  complete month; the biggest single purchases (no payer names); spending per person a month.
  Each one is left out when there isn't enough history for it.
- **Where it went**: each series with its total, share, monthly average and change. It's also
  the chart's text version for screen readers. A phone has room for one amount column, so a
  **Total | Per month** toggle in the card's corner picks which (only with more than one month);
  that keeps the table inside the card without scrolling sideways. Wider screens show both.
  On a phone the toggle's highlight slides (it jumps with reduced motion) and the amounts shown
  fade in, here and in the chart's panel (only the panel's contents are re-created, so its
  `aria-live` box stays and screen readers still read the change).

## How it's built
- Route: `app/periods/[year]/[month]/trends/page.tsx` with its `loading.tsx` (`TrendsSkeleton`
  in `components/page-skeleton.tsx`). `?range=1|3|6` (anything else → 3, `parseRange`) is read in
  the browser (`useSearchParams`) and written with `history.replaceState`, so it never reloads.
- Data: `getAllTrends` in `lib/trends-data.ts` checks the login, then loads up to
  `LOOKBACK_MONTHS` months ending at the one shown (bills, advances, who's in each month) in
  one query, and works out all three ranges from it. Household-wide, so a preview needs nothing
  different.
- Numbers: `buildTrends` in `lib/trends.ts` (pure, integer centavos; tested in
  `lib/trends.test.ts` with made-up months). The thresholds are named constants there
  (`MAX_SERIES`, `RISING_THRESHOLD_PCT`, `RISING_LOOKBACK`, `RISING_MIN_HISTORY`, `TOP_PURCHASES`).
  Colours (`slot`) are fixed by the whole loaded history, not the range.
- UI: `components/trends.tsx` (client: the range switch, headline, insights),
  `components/trends-chart.tsx` (client: Recharts through shadcn's `components/ui/chart.tsx`),
  `components/trends-breakdown.tsx` (client, for the phone toggle: the Where it went card),
  `components/trends-parts.tsx` (the card frame and change arrow, used by both cards) and
  `components/trends-colors.ts` (the palette, shared by the chart and the table).
- No tables of its own: it reads `billing_periods`, `bill_items`, `advances`, `period_balances`.

## Rules
Reads the money, never changes it. What a bill or an advance is:
[settlement-rules.md](../settlement-rules.md). The choices behind this page:
[decisions](../decisions.md) (2026-10-16).

## Open items
- Bills are matched across months by column name, so renaming a column starts a new series
  ([TODO.md](../TODO.md) → Ideas).

## Built in
`feat/trends`.
