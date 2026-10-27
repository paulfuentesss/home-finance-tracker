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
  cells stay blank: her visits have their own dates on the [Helper tab](helper.md). A bill with a
  Due date and no Date paid is on the admin's "Bills to pay" banner
  ([reminders](reminders.md)). Date paid stays editable for the admin once the month is closed;
  the Due date doesn't.
- Once a month has Helper visits or early pay logged, the Helper column's total comes from the
  Helper tab: shown read-only, linked to it.
- A shared column's total is the advances logged into it, so once something is logged there it
  links the same way ("from the Advances tab"), opening the [Advances Log](advances.md) filtered
  to that column. A column with nothing logged shows a plain ₱0.00 — except, for PA, a Manual
  one that's over or short (the missing advance is logged there).
- A **greeting** at the top: "Good evening, Ana 🌙" (morning / afternoon / evening, Manila
  time) with their emoji, big, beside it (none if they haven't set one) and their own number in
  plain words. The card's background follows the time of day too: a sunrise in the morning, a
  clear sky in the afternoon, a night sky with stars in the evening. A housemate sees what they still
  have to pay ("You have ₱X left to pay into the House Budget" with a Settle up link to the
  latest month, where "I paid" goes), "Your payment is waiting for PA to confirm", "The
  House Budget pays you ₱X" or "You're all settled 🎉". That's their Final less waiting "I paid"s
  and later payments, never more than they owe overall now (`payablesIn`, [settlement-rules.md →
  What's still owed](../settlement-rules.md)), the same as the bill banner and email, so nobody
  is asked to pay twice. While they still have some left to pay, a small line under it says when
  they last paid: "Last paid Aug. 12 · 2 months ago" (their latest confirmed payment, from any
  month; just the date if it's under a month). With no payment on record there's no line. Only
  their own, never someone else's. The collector sees "You get back ₱X overall" (they paid the bills upfront), as in Who owes what. A view-only login
  gets the hello and "Hope you're doing well wherever you are! 💛" (no number: they're in no
  month); a closed month just says it's closed.
- "Who owes what" cards above the table: who pays into the House Budget, who gets paid from
  it, and what's left for the collector — readable on a phone where the wide table isn't.
- **"You"**: your own row in the table and in Who owes what has a "You" tag, and the table row a
  light blue tint. Everyone shows with their emoji, or their colour dot without one
  ([manage.md](manage.md)). When PA previews as a housemate, all of this follows the housemate.
- Flags a Manual column whose amounts don't add up, and shows the Month Final total (₱0.00 when
  everything adds up). When it isn't, a short "should be ₱0.00 ⓘ" note opens a popover naming
  the columns that are over or short (kept short so it doesn't widen the column).
- On a phone the table scrolls sideways; a "›" on its right edge shows there's more, until the end.
  The name column stays put, with an edge once scrolled so the columns under it don't peek out.
  Once scrolled, it also slides narrower to make room: names and their tags fold away to just
  the emojis, the month in the corner ("OCT 2026") becomes "OCT", "Due date" / "Date paid" become "Due" / "Paid". Back
  at the start, they slide back. Phones only (narrower than 640px); wider screens have the room.
- Pending (emailed) bills are shown greyed out with Confirm / Discard ([email-bills.md](email-bills.md)).

## How it's built
- Route: `app/periods/[year]/[month]/(split)/page.tsx` (tab 1; the `(split)` route group isn't
  part of the URL and only gives it its own `loading.tsx`). The layout (`layout.tsx`) loads the
  month once per request and renders the sidebar (`components/app-sidebar.tsx`) and the header
  (`components/period-header.tsx`).
- Data: `getPeriodView` in `lib/periods.ts` loads the month plus every earlier one (for
  carry-over), runs `computeMonth` (`lib/settlement.ts`, pure, tested) and shapes plain JSON for
  the client.
- UI: `components/split-table.tsx` (table, `MoneyInput`, `DateCell`, `TotalLink` for the totals
  that come from another tab — its `aria-label` names where it goes),
  `components/settle-summary.tsx` (Who owes what), `components/greeting.tsx` (the greeting;
  the part of day is worked out on the server, `partOfDayInManila` in `lib/format.ts`, so the
  page and the browser agree), `components/you-tag.tsx`, `components/balance.tsx`,
  `hooks/use-drag-scroll.ts` (drag to scroll the wide table, also from a linked total — the
  browser's own link drag is held back, and a link needs a bit more movement, so a shaky click
  still opens it; sets `data-more-right` for the "›" hint and
  `data-scrolled-left` for the name column's edge and narrowing).
- The narrowing is `Squeeze` / `ScrollLabel` in `split-table.tsx` (`shortMonthLabel` /
  `shortMonthName` in `lib/format.ts`). CSS only, no re-render on scroll: it animates `max-width` to 0 under
  `max-sm:group-data-scrolled-left/scroller:`. The width it animates from is measured
  (`--squeeze-w`, a `ResizeObserver`), not a fixed cap, because names can be up to 40
  characters. The scroller has `overflow-anchor: none`, so the browser can't pull the scroll
  back to the start as the column narrows (which would widen it again, back and forth).
- The collector's "overall" number comes from `collectorNetOf` (`lib/who-owes.ts`, pure, tested),
  used by both Who owes what and the greeting so they can't disagree.
- The greeting's "Last paid" line comes from `lastPaidOf` (`lib/last-paid.ts`, pure, tested),
  filled into `view.lastPaid` by `getPeriodView` from every month's payments, with today's date
  from the server (`todayInManila`).
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
