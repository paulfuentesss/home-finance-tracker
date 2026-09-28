# Months

## Status
✅ Working.

## What it does
- **Month picker** in the header; the home page opens the most recent month.
- **Start <next month>** (on the latest month): creates the next month with everyone currently
  active, copies the bill columns (split, points, payer) at ₱0.00 and an empty Advances Shared.
  Refuses to leave out someone who moved out with an unsettled Final.
- **Live carry-over:** an open month's Prev Month Unsettled is the previous month's Final,
  computed on the fly.
- **Closing** locks a month and saves everyone's Final as the next month's opening balance;
  unpaid amounts carry over. Months close oldest-first and reopen newest-first. Closing is
  blocked while the numbers can't be calculated, a bill is still pending, or someone with a
  balance isn't in the next month.
- Loading placeholders while a month or tab loads.

## How it's built
- Routes: `app/page.tsx` (redirects to the latest month), `app/periods/loading.tsx` (month
  switches), `app/periods/[year]/[month]/loading.tsx` (tab switches).
- UI: `components/period-nav.tsx` (month picker, Start next month), `components/period-header.tsx`,
  close / reopen in `components/settle-up.tsx`, `components/page-skeleton.tsx`.
- Carry-over: `computePeriod` in `lib/periods.ts` walks every month up to the one shown.
- Lock rules: `closeCheck`, `reopenCheck`, `vanishingBalances` in `lib/month-lock.ts` (pure,
  tested in `lib/month-lock.test.ts`).
- Actions: `startNextMonth`, `closeMonth`, `reopenMonth` in `app/periods/[year]/[month]/actions.ts`.
- Tables: `billing_periods` (status, closed at), `period_balances` (who's in the month,
  opening and closing balances).

## Rules
[Months and carry-over](../settlement-rules.md#months-and-carry-over) ·
[Closing and reopening a month](../settlement-rules.md#closing-and-reopening-a-month)

## Open items
Back up after closing each month ([operations.md](../operations.md#backups)).

## Built in
Early commits on `main` (month picker, Start next month, loading states); #1 (closing /
reopening); #2 (pending bills block closing).
