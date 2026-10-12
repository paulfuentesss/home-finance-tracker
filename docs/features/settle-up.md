# Settle Up

## Status
✅ Working.

## What it does
- Lists who still owes whom — everyone settles through the
  [House Budget](../settlement-rules.md#house-budget) — with the suggested payment for each, in
  the order they happen: into the House Budget, out to whoever is owed, then what's left to PA
  ("yours to move to your account"). Shows what the House Budget holds, and notes a payout it
  doesn't hold enough for yet.
- **PA:** one tap records a payment (the amount is pre-filled; partial amounts are fine, and
  the form lets PA change who paid whom; either side can be the House Budget). It counts right
  away. When there's nothing to tap (everyone settled, or a problem stops the numbers), a plain
  "Record a payment" button takes its place.
- **A housemate: "I paid"** on their own row, in the latest open month — the amount (what they
  owe, pre-filled), the date, a note and the **transfer's screenshot (required)**. It's money
  into the House Budget and shows as **Waiting for PA**: not counted yet. If they already have
  one waiting, the dialog says so.
- **PA confirms or rejects it:** a **Waiting for you** section at the top of Settle Up and a
  count on Settle Up in the sidebar. **Confirm** (after checking the bank) makes it count; **Reject**
  asks for a short reason, and it stays in the list as rejected — never counted. The housemate
  can **Cancel** their own while it's waiting or rejected, and send it again. On a member's
  row, a waiting amount shows ("₱X sent, waiting"), so PA doesn't record it a second time.
- Nothing updates live: the count, like the rest of the month, is as of the page's last load.
  Coming back to the app after 30 seconds or more away refreshes it (`useRefreshOnReturn` in
  `components/viewer-context.tsx`); moving between tabs alone keeps the month's sidebar and header as they were.
- A payment's screenshot shows only for PA and the people in it ([receipts.md](receipts.md)).
- Lists the month's payments, which PA can edit or delete while the month is open (a waiting
  one can be edited before confirming; a rejected one only deleted).
- Confirmed payments move each person's Final toward ₱0.00 and show in the Split Table's
  Payments column.
- **Email everyone their bill** (PA): once the bills are in, each housemate gets their own
  amount and a link here; a housemate whose bill is out sees "Your bill is ready" at the top of
  the month pages until it's paid ([reminders.md](reminders.md)).
- Also where a month is closed or reopened ([months.md](months.md)). Closing a month, and
  starting the next one, wait until no payment is waiting.

## How it's built
- Route: `app/periods/[year]/[month]/settle/page.tsx` (with the proofs this viewer may see,
  `getPeriodReceipts`).
- UI: `components/settle-up.tsx` (Waiting for you, suggestions, payments list with Confirm /
  Reject / Cancel, close / reopen section); the payment and **I paid** dialogs in
  `components/entry-dialogs.tsx` (I paid shrinks the screenshot first: `useDialogForm`'s
  `prepare`); the count on Settle Up in `components/period-nav.tsx` (`SidebarNav`).
- Math: `suggestedPayments`, `computeMonth` and `houseBudgetMonth` in `lib/settlement.ts` (pure,
  tested) count only `confirmed` payments; `closeCheck` / `startCheck` in `lib/month-lock.ts`
  wait for pending ones. A payment side is a `Party`: a member id or `HOUSE_BUDGET`, stored as
  NULL (`partyFromColumn` / `partyToColumn`, used only in `lib/periods.ts` and the actions).
  `computePeriod` carries the House Budget across months.
- Shown as "● Ana → 🏛 House Budget" by `Pair` / `partyView` in `components/member-pair.tsx`.
- Permissions: `canSubmitPayment`, `canCancelPayment`, `canSeePaymentProof`, `canOpenReceipt`
  in `lib/permissions.ts` (pure, tested).
- Actions in `app/periods/[year]/[month]/actions.ts`: `addPayment`, `updatePayment`,
  `deletePayment` (PA); `submitPayment`, `cancelPayment` (members — the guard test lists them);
  `confirmPayment`, `rejectPayment` (PA). Status changes are conditional writes (only from
  `pending`), and closing, starting a month and "I paid" lock the month's row, so they can't
  cross each other.
- Table: `payments` (from, to — NULL is the House Budget — amount, paid on, note, `status`,
  `rejected_reason`).

## Rules
[House Budget](../settlement-rules.md#house-budget) ·
[Payments (Settle Up)](../settlement-rules.md#payments-settle-up)

## Open items
None. Extra proofs on a waiting payment are PA's to attach (Receipts tab).

## Built in
#1 (settle-up tab, closing / reopening months, keep-alive) · #29 ("I paid" with proof).
