# Settlement rules

How My House splits household costs each month. This is the source of truth for
`lib/settlement.ts`, `lib/money.ts` and `db/schema.ts`: change the rules here first, then
the code. The household-facing version is the **How it works** page
(`app/how-it-works/page.tsx`) — keep the two in sync. This file holds the rules only: what
each feature does and how it's built is in [features/](features/README.md).

The examples use a **made-up August 2026** (Ana, Ben, Cara, Dan and PA), which is also the test
fixture (`lib/__fixtures__/august-2026.ts`). The repo is public, so the household's real names
and amounts never appear here; they live only in the database.

## Members and the collector

**PA is the collector**: he usually pays Meralco, Water, PLDT and the Helper upfront
and everyone settles up through the [House Budget](#house-budget), the account he looks after
(`members.is_collector`, at most one). Being the collector only means three things in the math:

1. new bills default to PA as the payer,
2. PA absorbs leftover centavos when splitting (see Rounding), and
3. what's left in the House Budget once everyone else is settled is paid out to PA.

Otherwise PA is treated exactly like everyone else.

Members are never deleted, only deactivated (`members.active = false`). Each month has its
own member list — the rows in `period_balances` — and every split uses that list, so old
months never change when someone moves in or out.

## The full ledger: Month Final

For each member, every month:

```
Total       = bill shares + shared-column shares
Own Adv (−) = advances they paid + bills they paid to the provider
Month Final = Total − Own Adv
```

- **Positive** → the member **owes** that amount.
- **Negative** → the member is **owed / reimbursed** that amount.
- **Zero** → **settled**.

**Everyone's Month Final adds up to ₱0.00** — what some owe is exactly what others are owed —
as long as every Manual shared column's typed amounts add up to its total. Any difference is
shown on that column ("₱0.02 over") and in the Month Final total, like the sheet's check.

> **Never log a bill as an advance.** Bills paid by someone are credited through
> `bill_items.paid_by_id` — or, for the Helper, through who handed her money
> ([The Helper](#the-helper)). The Advances Log *shows* them as read-only "Bills" rows, but they
> are not stored as advances, so nothing is counted twice.

### August 2026 (made up)

Bills (all paid by PA): Meralco ₱12,507.54 · Water ₱1,948.63 · PLDT ₱1,899.00 ·
Helper ₱5,500.00 = **₱21,855.17**. Shared advances: **₱61,951.90**.

| | Ana | Ben | Cara | Dan | PA |
|---|---:|---:|---:|---:|---:|
| Meralco (points) | 3,355.68 | 2,287.97 | 2,287.96 | 1,525.31 | 3,050.62 |
| Water | 389.73 | 389.73 | 389.72 | 389.72 | 389.73 |
| PLDT Wifi | 379.80 | 379.80 | 379.80 | 379.80 | 379.80 |
| Helper | 1,100.00 | 1,100.00 | 1,100.00 | 1,100.00 | 1,100.00 |
| Advances Shared | 4,718.10 | 4,718.10 | 4,718.10 | 4,718.10 | 4,718.10 |
| Advances Shared w/o PA | 8,790.10 | 8,790.10 | 8,790.10 | 8,790.10 | — |
| Ice Maker Adj. (Manual) | 1,600.50 | 400.13 | 400.13 | 400.13 | 400.13 |
| **Total** | 20,333.91 | 18,065.83 | 18,065.81 | 17,303.16 | 10,038.38 |
| Own Adv (−) | 4,980.00 | 7,960.00 | 33,125.00 | 11,940.40 | 25,801.67 |
| **Month Final** | **15,353.91** | **10,105.83** | **−15,059.19** | **5,362.76** | **−15,763.29** |

Sum: **₱0.02** — the Ice Maker's typed amounts add up to ₱3,201.02, ₱0.02 over (the app
flags it). Each Month Final is within ₱0.01 of what a spreadsheet gets by rounding each share
on its own; the app's bill shares always add up to the bill.

## Rounding: everything in centavos

Money is stored as `numeric(12,2)` and all arithmetic is done in whole centavos
(`lib/money.ts`), never with floating-point numbers.

- **Equal splits:** leftover centavos go one each in **`splitOrder`**: the collector first,
  then by `sort_order`. Water ₱1,948.63 ÷ 5 = 389.726 → PA, Ana and Ben pay ₱389.73;
  Cara and Dan pay ₱389.72.
- **Points / weighted splits:** largest-remainder method — leftovers go to the largest
  fractional parts, ties broken in `splitOrder`. (August's Meralco: Ben and Cara have equal
  points, so they tie for the last leftover centavo; Ben comes first in sort order and gets it.) Shares always add up to the total. Points
  (2 decimals) are converted to whole hundredths first (2.5 → 250) so the remainders are
  compared exactly; floating-point decimals could otherwise break a tie the wrong way.

## Bill columns (fixed split)

Each bill column's split is **fixed** — there's no switch in the table:

| Bill | Split |
|---|---|
| **Meralco** | **Points** — share = total × member's points ÷ total points |
| Water, PLDT Wifi, Helper | **Auto equal** — total ÷ the month's members |
| A new bill column | **Auto equal** or **Manual**, chosen when it's added (Manual: type each person's amount; the bill's total is their sum) |

Shares are computed in one place: `computeBillShares` in `lib/settlement.ts`.

## The Helper

The Helper has no fixed day or pay, and whoever is home pays her. Each **visit** (her daily
pay) and each **early pay** (money given before she works) is logged on the Helper tab
(`helper_entries`). Three rules:

1. **Whoever hands her money gets it back.** Each person is credited what they handed over —
   daily pay minus anything taken off her debt, plus early pay — in their Own Adv (−), like a
   bill they paid. Someone who pays ₱650 daily pay and gives ₱1,200 early pay on the same day
   (made up) is credited ₱1,850 that month.
2. **The month's Helper bill is everything handed to her:**
   `Σ (daily pay − taken off) + Σ early pay`, split **Auto equal** like any bill. It's never
   negative. A visit taken off in full (pay ₱350, ₱350 taken off) adds ₱0.
3. **Her debt** = early pay − everything taken off, across all months (the sheet's
   "Remaining"). It's only a record: it never enters the split by itself, and never goes below
   ₱0 at any point, in ledger order (month by month; in a month, her starting debt first, then
   by date, early pay before a visit on the same day).

Example (made up): daily pay ₱3,250 over a month, ₱450 of it taken off her debt, and ₱1,200
early pay given → the Helper bill is 3,250 − 450 + 1,200 = **₱4,000**, and her debt goes up by
₱750. A month where she borrows more than she works off costs more than her daily pay;
a later month where she works it off costs less. Over time the house pays exactly her pay.

- **Her starting debt** (the sheet's Remaining when moving over) is entered once as an
  `opening` entry: it adds to her debt but to **no bill**, since the sheet already settled it.
- A month with **no visits or early pay** keeps the old way: a typed Helper total, paid by the
  column's payer (`paid_by_id`); her starting debt doesn't change that. The first visit or early
  pay replaces that total, and from then on the column's payer counts for nothing (someone
  leaving the house isn't kept in the month by it).
- The bill credits several payers through `paidBy` on the bill (`computeMonth`); their amounts
  must add up to the bill total. Shares still come only from `computeBillShares`.
- An entry belongs to the month it's logged in, whatever its date (a visit paid late).

### Meralco point system

Meralco is split by points (`bill_item_shares.points`) because aircon and PCs use more
electricity. Points are edited in *Manage Columns & People → Meralco Points*. In the made-up
August — **8.2 points**:

| Ana | PA | Ben | Cara | Dan |
|---:|---:|---:|---:|---:|
| 2.2 | 2 | 1.5 | 1.5 | 1 |

The items the points are built from are a setting (`MERALCO_POINT_ITEMS` in
`lib/household-config.ts`).

**Cost per point = bill ÷ total points.** August: ₱12,507.54 ÷ 8.2 ≈ ₱1,525.31 per point.

## Shared columns (advances)

An advance is a household purchase someone paid for themselves (grocery, food, service,
misc). The payer's amount counts in their Own Adv. Every advance is logged into a **shared
column** (`shared_columns`; `advances.column_id`), and a column's total is the sum of its
advances. Each column is either:

- **Auto equal** — split equally among the members ticked as sharing it
  (`shared_column_members.included`), leftover centavos collector-first; or
- **Manual** — each person's amount is typed (`shared_column_members.amount`). If the
  amounts don't add up to the column total, the difference is shown ("₱0.02 over") but
  nothing is blocked.

Switching Auto equal → Manual pre-fills the current equal amounts; Manual → Auto equal shares
it among everyone who had an amount.

Every month has **Advances Shared** (`is_default`, everyone, Auto equal), the usual column.
Situational columns are added when needed:

> August: PA was away for most of the month, so later purchases went into **Advances Shared
> w/o PA** (₱35,160.40 → ₱8,790.10 × 4). **Ice Maker Adj.** (₱3,201.00, paid by PA) is Manual:
> Ana ₱1,600.50, the others ₱400.13 each.

A column with advances can't be deleted — move them first by editing each advance and
picking another column (or delete them) — and Advances Shared always stays.

Advances can be **edited** (payer, category, description, amount, date, column) while the
month is open; everyone's shares are recalculated from the new values. An advance always
stays in the month it was logged in.

## Months and carry-over

**Final** = Prev Month Unsettled (opening) + Month Final − paid out + received — the same
formula for everyone, the collector included.

## House Budget

The **House Budget** is the household's collection account, a savings account PA looks after
(its name in the bank, `HOUSE_BUDGET_LABEL` in `lib/household-config.ts`). Housemates pay
what they owe into it; PA pays out of it, first to whoever is owed, then what's left to
himself. In the math it's **one side of a payment, never a member** (`HOUSE_BUDGET` in
`lib/settlement.ts`; a NULL side in `payments`): it takes no share of anything and isn't in a
month's member list.

- **What it holds** = opening + received − paid out (`houseBudgetMonth`). The same sign as a
  member's Final: positive is money still to be paid out. Only confirmed payments count.
- **Opening** = every earlier month's House Budget payments, in − out. It's worked out from
  the payments, not stored: payments in a closed month can't change, so the sum can't either.
  Money still in it at the end of a month **carries over**, like an unpaid Final.
- It **may go negative**, when PA pays someone out before the money comes in; the numbers
  stay right, and Settle Up says so.
- **Everyone's Final + what the House Budget holds = ₱0.00**, apart from Manual-column
  differences: each month's stays in the collector's Final and carries over with it, so they
  add up across months (₱0.02 over in August and again in September → ₱0.04). Money only
  counts as PA's once it's paid out to him
  ("House Budget → PA"), so his Final doesn't move when a housemate pays in.
- PA moving money from the House Budget to his own account **is** that payment: record it.
  Payments between two members (PA paying someone from his own account) are still allowed.

## Payments (Settle Up)

A payment (`payments`) records money actually changing hands. It belongs to the month it's
recorded in: the payer's `paid out` and the receiver's `received` both move toward ₱0.
The Split Table shows them in the **Payments** column as `received − paid out` (− when
you paid back, + when you received). With the House Budget's row, which shows its own
`received − paid out`, that column adds up to ₱0.00.

The Settle Up tab suggests the payments that settle everyone through the House Budget
(`suggestedPayments` in `lib/settlement.ts`), in the order they happen:

1. whoever owes (other than the collector) pays their Final into the House Budget;
2. the House Budget pays whoever is owed (other than the collector), largest first;
3. what the House Budget would hold after that goes to the collector — or, if it would be
   short, the collector pays the difference in.

Recording all of them brings every Final and the House Budget to ₱0, except the collector's
Final, which keeps only what doesn't add up (a Manual column that's over or short). Any other
pair and partial amounts are allowed, with the House Budget on at most one side. Payments can be
edited or deleted while the month is open (a rejected one only deleted; a waiting one keeps who
paid whom).

**A housemate's "I paid"** (`payments.status`): a housemate sends their own payment, always
into the House Budget, in the latest month, with the transfer's screenshot (required). It is
**pending** — shown as waiting, **not counted** — until the collector checks it arrived and
**confirms** it, after which it counts exactly like one the collector recorded. If it didn't
arrive the collector **rejects** it with a reason: it stays visible as rejected and **never
counts**. The housemate can cancel their own while it's pending or rejected. Payments the
collector records himself are confirmed at once. Only confirmed payments enter the ledger
(`computeMonth`, `houseBudgetMonth`), the carry-over and the suggested payments. A payment's
screenshot is seen only by the collector and the member in the payment (both members, for a
payment between two); everyone sees the payment itself.

> August: Ana ₱15,353.91 · Ben ₱10,105.83 · Dan ₱5,362.76 → House Budget (₱30,822.50 in) ·
> House Budget → Cara ₱15,059.19 · House Budget → PA ₱15,763.31 (what's left). Afterwards
> the House Budget is ₱0.00 and PA's Final is ₱0.02 (the Ice Maker difference). Halfway —
> say only Dan has paid in — PA's Final is still −₱15,763.29 and the House Budget holds
> ₱5,362.76.

**Carry-over is live:** an open month's opening balance is the previous month's Final,
computed on the fly back to the first month (or to the last closed month, whose stored
`period_balances.opening_balance` is used). Unpaid amounts therefore carry over
automatically, like the sheet's "Prev Month Unsettled". The House Budget always carries over
from the payments themselves, closed months included ([House Budget](#house-budget)).

**Starting a month** ("Start <next month>" at the bottom of the month picker, on the latest month) creates the next month with
everyone currently active and carries over (not while a housemate's payment is still waiting
in the latest month — the new month's carry-over would show them owing it all again, and they
might pay twice):

- the bill columns — name, split, Meralco's points, payer, and which one is the Helper's — at **₱0.00**
  (`bill_items.total_amount >= 0`), ready for the new bills;
- an empty **Advances Shared** column;
- each person's Final as **Prev Month Unsettled** (computed live).

Situational shared columns, advances and dates aren't copied. December is followed by
January of the next year.

**After a closed month**, "Start next month" copies each person's stored closing balance as
the new month's opening balance.

## Closing and reopening a month

**Closing** locks a month (`billing_periods.status = 'closed'`): every change to it is
rejected. It saves each member's Final as `period_balances.closing_balance`, and — when the
next month already exists — as that month's `opening_balance`, which is used from then on
instead of the live carry-over. Unpaid amounts carry over; nobody has to be at ₱0.

Rules (`lib/month-lock.ts`):

- **Oldest-first:** a month can close only when the previous month is closed (or it's the
  first month). Otherwise its opening balance could still change.
- **Newest-first reopening:** only a month whose next month is open can reopen. Reopening
  clears the closing balances; the next month goes back to live carry-over by itself.
- **Blocked** while the month's numbers can't be calculated, or when someone with a non-zero
  Final isn't in the next month (their balance would vanish — record the payment first).
- **Blocked while a bill is pending** (emailed, not yet confirmed or discarded), **or a
  housemate's payment is waiting** (not yet confirmed or rejected): once the month and the one
  after it are closed, it could never be. Rejected payments don't block.
- The confirmation lists who is still unsettled, what the House Budget still holds, bills
  still at ₱0.00, and Manual columns that don't add up; none of them block closing. (A bill still at ₱0.00 may simply not have
  arrived: bills belong to the month they're for, which has usually ended when they arrive.)


## Adding and removing members

- **Adding** someone adds them to every open month. Equal bills re-split; Meralco gives them
  0 points until set; manual bills and columns give them ₱0; they join Advances Shared but
  not situational Auto-equal columns. Re-adding a former member's name reactivates them.
- **Removing** someone deactivates them (left out of future months). In open months where
  they have no advances, payments, bills paid (with an amount above ₱0), Helper visits or early
  pay, typed amounts in a Manual bill, or Manual column amounts, they're removed and the bills re-split; where they
  do, they stay so that month's numbers don't change. They also stay in a month they carried
  an unsettled balance into (Prev Month Unsettled ≠ ₱0), so it can't vanish; "Start next
  month" refuses to leave out someone who moved out with an unsettled Final. The collector
  can't be removed.
- A ₱0 bill they're down as paying (copied from the previous month by "Start next month",
  before the real bill arrives) doesn't keep them in: it's handed to the collector and they
  leave that month.

## Email-imported bills

Meralco, Water (Manila Water) and PLDT email their bills. Each email is read
(`lib/bill-email/parse.ts`) and recorded in the **Bill inbox** (`bill_emails`):

- **What's read:** the amount (Meralco "Current Amount Due", Manila Water "Total Amount
  Due", PLDT "Current Charges" — not its Total, which would include an unpaid previous
  balance), the due date and the billing period. Only emails from the providers' own domains
  are read.
- **Which month:** the month the provider names ("Meralco bill for August 2026", "Invoice for
  the Month of August 2026", "eInvoice for August 2026") — the month the household sheet puts
  it in. If none is named, the month holding the middle of the billing period.
- **Where it goes:** it fills that month's existing bill column (Meralco, Water, PLDT Wifi —
  `BILL_EMAIL_COLUMNS` in `lib/household-config.ts`) with `source = 'email'`,
  `status = 'pending'` and its due date. Shares are computed as usual (Meralco by points), so
  confirming only flips the status.
- **Payment fee:** the fixed fee of the way PA pays each bill (a payment app's convenience
  fee, say) is added on top. The amounts are a setting, `BILL_PAYMENT_FEES` in
  `lib/household-config.ts`, changed when the way of paying changes. The fee is part of the
  bill, so **everyone shares it**, and the column notes it (a "From email" tag under the
  amount; its popover shows the emailed bill and the fee). With the fees, August 2026 imports
  at exactly the sheet's amounts. Bills already imported keep the fee they came in with
  (`bill_emails.fee`).
- **Pending is ignored by the settlement** until someone confirms it. Before confirming, the
  amount can still be changed. **Discard** sets the column back to ₱0.00 (split and points
  unchanged) and sets the email aside for good.
- **It never overwrites an amount.** When the month isn't started or is closed, the column is
  missing or split Manual, or the column already has an amount, the email stays in the Bill
  inbox (Manage tab) with the reason, to Retry or Dismiss. Deleting a column that an email
  filled sends that email back to the inbox.
- **Each email counts once:** the same Message-ID is ignored, and so is a second email for
  the same provider and month (a reminder) while the first isn't dismissed.

## Receipts

A receipt is proof — a screenshot or photo — attached to a bill or a payment
([features/receipts.md](features/receipts.md)). It **never changes the math**: a bill counts
whether or not its proof is attached. Like everything else, proofs can only be attached or
deleted while the month is open; deleting a bill or payment deletes its proofs.
