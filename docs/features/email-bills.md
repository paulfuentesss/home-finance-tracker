# Email-imported bills

## Status
🚧 Built, waiting for its first real bill. Reading emails, Pending bills, the Bill Inbox,
payment fees and the intake (a script in the My House Gmail → `/api/bill-email`) are done; it
counts as working once a real bill has arrived this way ([TODO.md](../TODO.md)). Meralco's
first (October 2026, forwarded) was refused by the sender check, since fixed
([decisions](../decisions.md), 2026-10-30). Setting it up:
[setup.md](../setup.md) step 7. Confirming, discarding and the Bill Inbox are PA's
([auth.md](auth.md)).

## What it does
- Every hour, a script in the My House Gmail sends new Meralco, Manila Water and PLDT bill
  emails to the app — also ones forwarded from PA's personal Gmail by a filter there, while a
  biller still sends to it. A bill that reaches both inboxes counts once.
- Reads each email: amount, due date, billing period, and the month the bill is for.
- Fills that month's bill column as **Pending**, with the usual payment fee added and noted
  (a "From email ⓘ" tag under the amount; hover or tap it for the emailed bill and the fee).
  Pending bills aren't counted until confirmed.
- A bill **typed in by hand** gets no fee added, so for PA, while the month is open, a column
  with a fee shows a "+ fee ⓘ" reminder under the amount (hover or tap it for which fee and
  how much) until an emailed bill fills it.
- Fills the column's **Due date** too, which puts the bill on the admin's "Bills to pay"
  banner and reminders until its Date paid is set ([reminders](reminders.md)). An email
  left in the Bill Inbox keeps its due date there (the banner shows it), and Discard clears it.
- **Confirm** / **Discard** under a pending bill in the Split Table; the amount stays editable
  before confirming.
- Emails that don't fit (month not started or closed, column missing or Manual, an amount
  already there) wait in the **Bill Inbox** (Manage tab) with the reason: **Retry** or
  **Dismiss**.
- A month can't be closed while a bill in it is pending.
- PA gets a notification ([notifications.md](notifications.md)) when a bill comes in (to confirm on
  the Split Table) or lands in the Bill Inbox — on devices that turned them on.

## How it's built
0. **Intake** — `scripts/gmail/bill-forwarder.gs`, a Google Apps Script in the My House Gmail
   (reference copy; it runs in that Google account). Hourly, it searches for the billers'
   bills received since it was set up, skips emails it has finished (fingerprints of their
   Message-IDs in Script Properties — Gmail labels whole threads, so labels are only for
   show), and POSTs each one — Message-ID, sender, subject, date, plain text, the topmost
   `Authentication-Results` header and every `ARC-Seal` — to `app/api/bill-email/route.ts`.
   200 → done, labelled `my-house/imported`; 400/422 → done, labelled `my-house/rejected`
   (`retryRejected()`, run by hand, sends those again once the cause is fixed); anything else →
   retried next hour. A refusal, or 3 failing runs in a row, emails `NOTIFY_TO` (at most daily).
   Runs take a script lock, so a hand run and the hourly one don't overlap.
   The route has no login, so it checks, in order: `BILL_EMAIL_SECRET` (a shared secret,
   constant-time), the body's shape, then `sentByBiller` (`lib/bill-email/intake.ts`, tested
   in `intake.test.ts`; `lib/actions-guard.test.ts` checks the secret comes first): Gmail's
   verdict that the biller sent it — a DKIM pass signed by the biller's domain, a DMARC pass
   for it (Meralco signs through Salesforce, so this is how its bills pass), or, for a bill
   forwarded from PA's personal Gmail, an ARC pass whose summary shows that DMARC pass under a
   set sealed by google.com. The header is read strictly (`resultsOf`): if a sender's address
   could have planted a result, it counts as unverified ([decisions](../decisions.md),
   2026-10-30). Only then `importBillEmail`.
1. **Parse** — `lib/bill-email/parse.ts` (pure, tested in `parse.test.ts`): sender-domain
   allow-list, the amount line per provider, dates, the bill month. Each value is read from
   after its label (`field()`), whether it's plain, in a table cell or in `*bold*` (Manila
   Water's layout since October 2026, which the parser didn't read before).
2. **Fee** — `lib/bill-email/fees.ts` reads `BILL_PAYMENT_FEES` (`lib/household-config.ts`);
   the fee is stored on the email row so later setting changes don't touch old bills.
   `columnPaymentFee` gives a column's fee by name, for the hand-typed reminder (`FeeReminder`
   in `components/emailed-bills.tsx`).
3. **Import** — `importBillEmail` / `placeBill` in `lib/bill-import.ts`: records the email in
   `bill_emails` (unique Message-ID; one live email per provider and month), then fills the
   column named in `BILL_EMAIL_COLUMNS` as `status = 'pending'`, `source = 'email'` inside a
   savepoint, or leaves the email `unmatched` with the reason. Filling takes a shared lock on the
   month first (`fillColumn`), so a close in progress finishes first and the email then finds
   the month closed ([decisions](../decisions.md), 2026-10-18).
4. **Review** — `confirmBill`, `discardEmailBill`, `retryBillEmail`, `dismissBillEmail` in
   `app/periods/[year]/[month]/actions.ts`; UI in `components/emailed-bills.tsx`
   (`EmailedNote`, `PendingBillActions`, `BillInbox`).
5. **Math** — `computeMonth` skips pending bills; `closeCheck` blocks closing while one is pending.

`importBillEmail` takes the database as a parameter (never `@/db`), so the same code runs from
the route and from `scripts/import-email.mts`. Test emails: [testing.md](../testing.md).

## Rules
[Email-imported bills](../settlement-rules.md#email-imported-bills) ·
[Closing and reopening a month](../settlement-rules.md#closing-and-reopening-a-month)

## Open items
- Turning it on and checking it on real bills: [TODO.md](../TODO.md).
- See a forwarded Meralco bill arrive as Pending after the ARC fix ([TODO.md](../TODO.md)).
- Idea: read payment-confirmation emails to fill "Date paid" ([TODO.md](../TODO.md)).

## Built in
#2 (import, Pending, Bill Inbox) · #3 (payment fees).
