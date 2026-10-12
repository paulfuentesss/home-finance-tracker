# Monthly Split Table

## Status
✅ Working.

## What it does
- Shows the month like the household sheet: one row per member, a column per bill and per
  shared column, then Total, Own Advance (−), Month Final, Prev Month Unsettled, Payments, Final.
- A **House Budget** row under the members, once money has gone through it: what it opened
  with, its payments, and what it holds ("Holding"). The footer totals include it, so Payments
  and Final still come to ₱0.00 ([rules](../settlement-rules.md#house-budget)).
- Bill totals and Manual amounts are edited in place (Enter or click away saves, Escape undoes).
- Due date and date paid per bill, except the Helper (`bill_items.kind = 'helper'`), whose
  cells stay blank: her visits have their own dates on the [Helper tab](helper.md).
- Once a month has Helper visits or early pay logged, the Helper column's total comes from the
  Helper tab: shown read-only, linked to it.
- "Who owes what" cards above the table: who pays into the House Budget, who gets paid from
  it, and what's left for the collector — readable on a phone where the wide table isn't.
- Flags a Manual column whose amounts don't add up, and shows the Month Final total (₱0.00 when
  everything adds up). When it isn't, a short "should be ₱0.00 ⓘ" note opens a popover naming
  the columns that are over or short (kept short so it doesn't widen the column).
- On a phone the table scrolls sideways; a "›" on its right edge shows there's more, until the end.
- Pending (emailed) bills are shown greyed out with Confirm / Discard ([email-bills.md](email-bills.md)).

## How it's built
- Route: `app/periods/[year]/[month]/page.tsx` (tab 1). The layout (`layout.tsx`) loads the
  month once per request and renders the sidebar (`components/app-sidebar.tsx`) and the header
  (`components/period-header.tsx`).
- Data: `getPeriodView` in `lib/periods.ts` loads the month plus every earlier one (for
  carry-over), runs `computeMonth` (`lib/settlement.ts`, pure, tested) and shapes plain JSON for
  the client.
- UI: `components/split-table.tsx` (table, `MoneyInput`, `DateCell`),
  `components/settle-summary.tsx` (Who owes what), `components/balance.tsx`,
  `hooks/use-drag-scroll.ts` (drag to scroll the wide table; sets `data-more-right` for the
  "›" hint).
- Edits: `updateBillTotal`, `updateBillShare`, `updateBillDates`, `updateSharedColumnAmount` in
  `app/periods/[year]/[month]/actions.ts`, through `components/inline-input.tsx`
  (`onSubmit` + `startTransition` so a failed save keeps what was typed).
- Tables: `bill_items`, `bill_item_shares` (materialized shares), `shared_columns`,
  `shared_column_members`, `advances`, `payments`, `period_balances`.

## Rules
[The full ledger](../settlement-rules.md#the-full-ledger-month-final) ·
[Rounding](../settlement-rules.md#rounding-everything-in-centavos) ·
[Bill columns](../settlement-rules.md#bill-columns-fixed-split) ·
[Shared columns](../settlement-rules.md#shared-columns-advances)

## Open items
None right now. Offline viewing comes with the PWA ([TODO.md](../TODO.md)).

## Built in
Early commits on `main` (month page, 4-tab redesign, fixed bill splits, Who owes what cards);
Payments column in #1; pending bills in #2 / #3.
