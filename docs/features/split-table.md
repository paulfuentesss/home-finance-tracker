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
- A **greeting** at the top: "Good evening, Ana 🌙" (morning / afternoon / evening, Manila
  time) with their emoji, big, beside it (none if they haven't set one) and their own number in
  plain words. The card's background follows the time of day too: a sunrise in the morning, a
  clear sky in the afternoon, a night sky with stars in the evening. A housemate sees what they still
  have to pay ("You have ₱X left to pay into the House Budget" with a Settle up link to the
  latest month, where "I paid" goes), "Your payment is waiting for PA to confirm", "The
  House Budget pays you ₱X" or "You're all settled 🎉". That's their Final less waiting "I paid"s
  and later payments (`payablesIn`), the same as the bill banner and email, so nobody is asked to
  pay twice. The collector sees "You get back ₱X overall" (they paid the bills upfront), as in Who owes what. A view-only login
  gets only the hello; a closed month just says it's closed.
- "Who owes what" cards above the table: who pays into the House Budget, who gets paid from
  it, and what's left for the collector — readable on a phone where the wide table isn't.
- **"You"**: your own row in the table and in Who owes what has a "You" tag, and the table row a
  light blue tint. Everyone shows with their emoji, or their colour dot without one
  ([manage.md](manage.md)). When PA previews as a housemate, all of this follows the housemate.
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
  `components/settle-summary.tsx` (Who owes what), `components/greeting.tsx` (the greeting;
  the part of day is worked out on the server, `partOfDayInManila` in `lib/format.ts`, so the
  page and the browser agree), `components/you-tag.tsx`, `components/balance.tsx`,
  `hooks/use-drag-scroll.ts` (drag to scroll the wide table; sets `data-more-right` for the
  "›" hint).
- The collector's "overall" number comes from `collectorNetOf` (`lib/who-owes.ts`, pure, tested),
  used by both Who owes what and the greeting so they can't disagree.
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
Payments column in #1; pending bills in #2 / #3; greeting, "You" and emoji in `feat/member-photos`.
