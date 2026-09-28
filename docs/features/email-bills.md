# Email-imported bills

## Status
🚧 Partly built. Reading emails, Pending bills, the Bill Inbox and payment fees work.
**Missing:** the inbox address that forwarded emails arrive at — it needs the app online
([TODO.md](../TODO.md)). Until then, emails are imported with `npm run bills:import`.
Confirming, discarding and the Bill Inbox are PA's ([auth.md](auth.md)).

## What it does
- Reads Meralco, Water (Manila Water) and PLDT bill emails: amount, due date, billing period,
  and the month the bill is for.
- Fills that month's bill column as **Pending**, with the usual payment fee added and noted
  ("Emailed bill ₱… + ₱… <what the fee is>"). Pending bills aren't counted until confirmed.
- **Confirm** / **Discard** under a pending bill in the Split Table; the amount stays editable
  before confirming.
- Emails that don't fit (month not started or closed, column missing or Manual, an amount
  already there) wait in the **Bill Inbox** (Manage tab) with the reason: **Retry** or
  **Dismiss**.
- A month can't be closed while a bill in it is pending.

## How it's built
1. **Parse** — `lib/bill-email/parse.ts` (pure, tested in `parse.test.ts`): sender-domain
   allow-list, the amount line per provider, dates, the bill month.
2. **Fee** — `lib/bill-email/fees.ts` reads `BILL_PAYMENT_FEES` (`lib/household-config.ts`);
   the fee is stored on the email row so later setting changes don't touch old bills.
3. **Import** — `importBillEmail` / `placeBill` in `lib/bill-import.ts`: records the email in
   `bill_emails` (unique Message-ID; one live email per provider and month), then fills the
   column named in `BILL_EMAIL_COLUMNS` as `status = 'pending'`, `source = 'email'` inside a
   savepoint, or leaves the email `unmatched` with the reason.
4. **Review** — `confirmBill`, `discardEmailBill`, `retryBillEmail`, `dismissBillEmail` in
   `app/periods/[year]/[month]/actions.ts`; UI in `components/emailed-bills.tsx`
   (`EmailedNote`, `PendingBillActions`, `BillInbox`).
5. **Math** — `computeMonth` skips pending bills; `closeCheck` blocks closing while one is pending.

Takes the database as a parameter (never `@/db`), so the same code runs from the future
webhook and from `scripts/import-email.mts`. Test emails: [testing.md](../testing.md).

## Rules
[Email-imported bills](../settlement-rules.md#email-imported-bills) ·
[Closing and reopening a month](../settlement-rules.md#closing-and-reopening-a-month)

## Open items
- The bill inbox address (webhook) — after deploy ([TODO.md](../TODO.md)). Its Route Handler
  is public, so it checks the provider's signature itself and joins `PUBLIC_PATHS` in
  `proxy.ts` and the allowlist in `lib/actions-guard.test.ts` ([auth.md](auth.md)).
- Idea: read payment-confirmation emails to fill "Date paid" ([TODO.md](../TODO.md)).

## Built in
#2 (import, Pending, Bill Inbox) · #3 (payment fees).
