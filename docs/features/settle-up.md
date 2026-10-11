# Settle Up

## Status
✅ Working.

## What it does
- Lists who still owes whom — everyone settles with the collector — with the suggested
  payment for each person.
- **PA:** one tap records a payment (the amount is pre-filled; partial amounts are fine, and
  any pair of members is allowed). It counts right away.
- **A housemate: "I paid"** on their own row, in the latest open month — the amount (what they
  owe, pre-filled), the date, a note and the **transfer's screenshot (required)**. It goes to
  the collector and shows as **Waiting for PA**: not counted yet. If they already have one
  waiting, the dialog says so.
- **PA confirms or rejects it:** a **Waiting for you** section at the top of Settle Up and a
  count on the Settle Up tab. **Confirm** (after checking the bank) makes it count; **Reject**
  asks for a short reason, and it stays in the list as rejected — never counted. The housemate
  can **Cancel** their own while it's waiting or rejected, and send it again. On a member's
  row, a waiting amount shows ("₱X sent, waiting"), so PA doesn't record it a second time.
- A payment's screenshot shows only for PA and the two people in it ([receipts.md](receipts.md)).
- Lists the month's payments, which PA can edit or delete while the month is open (a waiting
  one can be edited before confirming; a rejected one only deleted).
- Confirmed payments move each person's Final toward ₱0.00 and show in the Split Table's
  Payments column.
- Also where a month is closed or reopened ([months.md](months.md)). Closing a month, and
  starting the next one, wait until no payment is waiting.

## How it's built
- Route: `app/periods/[year]/[month]/settle/page.tsx` (with the proofs this viewer may see,
  `getPeriodReceipts`).
- UI: `components/settle-up.tsx` (Waiting for you, suggestions, payments list with Confirm /
  Reject / Cancel, close / reopen section); the payment and **I paid** dialogs in
  `components/entry-dialogs.tsx` (I paid shrinks the screenshot first: `useDialogForm`'s
  `prepare`); the count on the tab in `components/period-nav.tsx`.
- Math: `suggestedPayments` and `computeMonth` in `lib/settlement.ts` (pure, tested) count only
  `confirmed` payments; `closeCheck` / `startCheck` in `lib/month-lock.ts` wait for pending ones.
- Permissions: `canSubmitPayment`, `canCancelPayment`, `canSeePaymentProof` in
  `lib/permissions.ts` (pure, tested).
- Actions in `app/periods/[year]/[month]/actions.ts`: `addPayment`, `updatePayment`,
  `deletePayment` (PA); `submitPayment`, `cancelPayment` (members — the guard test lists them);
  `confirmPayment`, `rejectPayment` (PA). Status changes are conditional writes (only from
  `pending`), and closing, starting a month and "I paid" lock the month's row, so they can't
  cross each other.
- Table: `payments` (from, to, amount, paid on, note, `status`, `rejected_reason`).

## Rules
[Payments (Settle Up)](../settlement-rules.md#payments-settle-up)

## Open items
None. Extra proofs on a waiting payment are PA's to attach (Receipts tab).

## Built in
#1 (settle-up tab, closing / reopening months, keep-alive) · #29 ("I paid" with proof).
