# Testing

## Automated tests

`npm test` runs every `*.test.ts` with Vitest in under a second. Only pure code is unit
tested (no database, no React) — which is why the money math and rules live in `lib/`.

| Test file | Covers |
|---|---|
| `lib/money.test.ts` | Centavo conversion, parsing typed amounts, equal and weighted splits |
| `lib/settlement.test.ts` | August 2026 reproduces the household sheet; bill shares; Month Final rules; shared columns; split order; suggested payments |
| `lib/month-lock.test.ts` | Closing / reopening rules, pending bills blocking a close, balances that would vanish |
| `lib/advances-log.test.ts` | Advances Log grouping and split labels |
| `lib/bill-email/parse.test.ts` | Reading the real August bill emails; refusing other senders; bill month; dates |
| `lib/bill-email/fees.test.ts` | The payment fee setting matches the August receipts |

Money or rule changes: update the expectations in `lib/__fixtures__/august-2026.ts`, which
mirror the household sheet — if the app and the sheet disagree, find out why before changing
either.

## Fixtures (test data)

| Fixture | What it is | Used by |
|---|---|---|
| `lib/__fixtures__/august-2026.ts` | August 2026 from the household Google Sheet: members, bills, points, advances, expected Month Finals | `settlement.test.ts`, `npm run db:seed:august` |
| `lib/bill-email/__fixtures__/august-2026-emails.ts` | The three bill emails behind August's bills, **scrubbed** | `parse.test.ts`, `npm run bills:import` |

**Adding an email fixture:** copy the plain-text body, then remove account and contract
numbers, names, phone numbers, invoice numbers and tracking links before saving — this repo
is public ([operations.md → Privacy & security](operations.md#privacy--security)).

## Test data in the database

August 2026 in the database is test data loaded from the fixture:

```bash
npm run db:seed:august -- --replace   # reset August (and its bill emails) to the sheet
```

It deletes and reloads only August 2026. Safe while August is the only month; once real
months follow it, a reset changes their carry-over — back up first (`npm run db:backup`).

## Trying things by hand

The dev loop: make the change → `npm run typecheck && npm run lint && npm test` → check the
pages in the browser with `npm run dev` running.

**Email-imported bills, start to finish:**
1. `npm run db:seed:august -- --replace`, then `npm run bills:import -- meralco water pldt` —
   all three go to the Bill Inbox (August already has its bills).
2. Split Table: set Meralco's amount to `0` (Enter). Manage → Bill Inbox → Meralco → **Retry**.
3. Meralco is now **Pending** with the fee note. Try **Confirm**, **Discard**, closing the month
   (blocked), or deleting the column (the email returns to the inbox).
4. Each test uses the email up; repeat from step 1.
