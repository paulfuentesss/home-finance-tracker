# Settle Up

## Status
✅ Working.

## What it does
- Lists who still owes whom — everyone settles with the collector — with the suggested
  payment for each person.
- One tap records a payment (the amount is pre-filled; partial amounts are fine, and any pair
  of members is allowed).
- Lists the month's payments, which can be edited or deleted while the month is open.
- Payments move each person's Final toward ₱0.00 and show in the Split Table's Payments column.
- Also where a month is closed or reopened ([months.md](months.md)).

## How it's built
- Route: `app/periods/[year]/[month]/settle/page.tsx`.
- UI: `components/settle-up.tsx` (suggestions, payments list, close / reopen section),
  payment dialog in `components/entry-dialogs.tsx`.
- Math: `suggestedPayments` in `lib/settlement.ts` (pure, tested).
- Actions: `addPayment`, `updatePayment`, `deletePayment` in `app/periods/[year]/[month]/actions.ts`.
- Table: `payments` (from, to, amount, paid on, note).

## Rules
[Payments (Settle Up)](../settlement-rules.md#payments-settle-up)

## Open items
Housemates sending their payment with proof, for PA to confirm ([TODO.md](../TODO.md)).
Proof for payments PA records is on the Receipts tab ([receipts.md](receipts.md)).

## Built in
#1 (settle-up tab, closing / reopening months, keep-alive).
