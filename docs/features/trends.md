# Spending Trends

## Status
✅ Working.

## What it does
- **Trends tab** (Household group in the sidebar, everyone sees it, view-only logins included):
  the household's spending over the last **1, 3 or 6 months** (default 3), ending at the month
  picked in the sidebar, so browsing back shows how things looked then. Fewer months than the
  range → it shows what there is ("Only 2 months so far"). **1 month** on a month still coming
  in (usually the current one) shows the newest complete month instead, and says so: on its own
  the current month would be nearly empty. 3 and 6 show it faded.
- **Spending** = the month's confirmed bills (the Helper's included) + its shared advances: the
  same two totals as the month header, so a bar's total matches its month. Pending (emailed)
  bills, settle-up payments and Helper entries (already in the Helper bill) don't count.
- **Stacked bar chart**: a bar per month, a colour block per bill (by column name) and per
  advance category (Grocery, Food, Service, Misc). Hover a bar for each block's amount and the
  month's total. At most eight blocks; the smallest of the rest fold into **Other**.
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
  the chart's text version for screen readers.

## How it's built
- Route: `app/periods/[year]/[month]/trends/page.tsx` (`?range=1|3|6`, anything else → 3,
  `parseRange`) with its `loading.tsx` (`TrendsSkeleton` in `components/page-skeleton.tsx`).
- Data: `getTrends` in `lib/trends-data.ts` checks the login, then loads up to
  `LOOKBACK_MONTHS` months ending at the one shown (bills, advances, who's in each month) in
  one query. Household-wide, so a preview needs nothing different.
- Numbers: `buildTrends` in `lib/trends.ts` (pure, integer centavos; tested in
  `lib/trends.test.ts` with made-up months). The thresholds are named constants there
  (`MAX_SERIES`, `RISING_THRESHOLD_PCT`, `RISING_LOOKBACK`, `RISING_MIN_HISTORY`, `TOP_PURCHASES`).
  Colours (`slot`) are fixed by the whole loaded history, not the range.
- UI: `components/trends.tsx` (server: headline, range links, insights, table),
  `components/trends-chart.tsx` (the only client part: Recharts through shadcn's
  `components/ui/chart.tsx`), `components/trends-colors.ts` (the palette, shared by both).
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
