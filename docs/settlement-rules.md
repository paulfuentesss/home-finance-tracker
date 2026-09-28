# Settlement rules

How MyHouse splits household costs each month. This is the source of truth for
`lib/settlement.ts`, `lib/money.ts` and `db/schema.ts`: change the rules here first, then
the code. The household-facing version is the **How it works** page
(`app/how-it-works/page.tsx`) — keep the two in sync.

The examples use the real **August 2026** numbers from the household Google Sheet, which
are also the test fixture (`lib/__fixtures__/august-2026.ts`).

## Members and the collector

The household: **Ate Toni, Mayee, Skyler, PJ and PA**.

**PA (Paul) is the collector**: he usually pays Meralco, Water, PLDT and the Helper upfront
and everyone settles with him (`members.is_collector`, at most one). Being the collector
only means two things in the math:

1. new bills default to PA as the payer, and
2. PA absorbs leftover centavos when splitting (see Rounding).

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
> `bill_items.paid_by_id`. The Advances Log *shows* them as read-only "Direct Bill Pay" rows,
> but they are not stored as advances, so nothing is counted twice.

### August 2026

Bills (all paid by PA): Meralco ₱15,463.59 · Water ₱2,173.63 · PLDT ₱2,699.00 ·
Helper ₱6,400.00 = **₱26,736.22**. Shared advances: **₱70,657.90**.

| | Ate Toni | Mayee | Skyler | PJ | PA |
|---|---:|---:|---:|---:|---:|
| Meralco (points) | 4,657.71 | 2,794.63 | 2,794.62 | 1,863.08 | 3,353.55 |
| Water | 434.73 | 434.73 | 434.72 | 434.72 | 434.73 |
| PLDT Wifi | 539.80 | 539.80 | 539.80 | 539.80 | 539.80 |
| Helper | 1,280.00 | 1,280.00 | 1,280.00 | 1,280.00 | 1,280.00 |
| Advances Shared | 5,441.70 | 5,441.70 | 5,441.70 | 5,441.70 | 5,441.70 |
| Advances Shared w/o PA | 9,922.10 | 9,922.10 | 9,922.10 | 9,922.10 | — |
| Ice Maker Adj. (Manual) | 1,880.50 | 470.13 | 470.13 | 470.13 | 470.13 |
| **Total** | 24,156.54 | 20,883.09 | 20,883.07 | 19,951.53 | 11,519.91 |
| Own Adv (−) | 5,732.00 | 8,785.00 | 37,851.00 | 13,636.40 | 31,389.72 |
| **Month Final** | **18,424.54** | **12,098.09** | **−16,967.93** | **6,315.13** | **−19,869.81** |

Sum: **₱0.02** — the Ice Maker's typed amounts add up to ₱3,761.02, ₱0.02 over, exactly as
in the sheet (the app flags it). Each Month Final is within ₱0.01 of the sheet, which rounds
each bill share on its own; the app's bill shares always add up to the bill.

## Rounding: everything in centavos

Money is stored as `numeric(12,2)` and all arithmetic is done in whole centavos
(`lib/money.ts`), never with floating-point numbers.

- **Equal splits:** leftover centavos go one each in **`splitOrder`**: the collector first,
  then by `sort_order`. Water ₱2,173.63 ÷ 5 = 434.726 → PA, Ate Toni and Mayee pay ₱434.73;
  Skyler and PJ pay ₱434.72.
- **Points / weighted splits:** largest-remainder method — leftovers go to the largest
  fractional parts, ties broken in `splitOrder`. Shares always add up to the total. Points
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

### Meralco point system

Meralco is split by points (`bill_item_shares.points`) because aircon and PCs use more
electricity. Allocation as of **April 2026** — **8.3 points**, edited in *Manage Columns &
People → Meralco Points*:

| Ate Toni | PA | Skyler | Mayee | PJ |
|---:|---:|---:|---:|---:|
| 2.5 | 1.8 | 1.5 | 1.5 | 1 |

Items the points are built from: General electricity 1 · Aircon 1 · PA's PC 0.3
(`lib/household-config.ts`).

**Cost per point = bill ÷ total points.** August: ₱15,463.59 ÷ 8.3 ≈ ₱1,863.08 per point.

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

> August: PA was away from Aug 8, so later purchases went into **Advances Shared w/o PA**
> (₱39,688.40 → ₱9,922.10 × 4). **Ice Maker Adj.** (₱3,761.00, paid by PA) is Manual: Ate
> Toni ₱1,880.50, the others ₱470.13 each.

A column with advances can't be deleted — move them first by editing each advance and
picking another column (or delete them) — and Advances Shared always stays.

Advances can be **edited** (payer, category, description, amount, date, column) while the
month is open; everyone's shares are recalculated from the new values. An advance always
stays in the month it was logged in.

## Months and carry-over

**Final** = Prev Month Unsettled (opening) + Month Final − paid out + received — the same
formula for everyone, the collector included.

## Payments (Settle Up)

A payment (`payments`) records money actually changing hands. It belongs to the month it's
recorded in: the payer's `paid out` and the receiver's `received` both move toward ₱0.
The Split Table shows them in the **Payments** column as `received − paid out` (− when
you paid back, + when you received), which adds up to ₱0.00 across everyone.

The Settle Up tab suggests the payments that settle everyone with the collector
(`suggestedPayments` in `lib/settlement.ts`): whoever owes pays the collector their Final,
and the collector pays whoever is owed. Recording all of them brings every Final to ₱0 except
the collector's, which keeps only what doesn't add up (a Manual column that's over or short).
Any other pair and partial amounts are allowed. Payments can be edited or deleted while the
month is open.

> August: Ate Toni → PA ₱18,424.54 · PA → Skyler ₱16,967.93 · Mayee → PA ₱12,098.09 ·
> PJ → PA ₱6,315.13. Afterwards PA's Final is ₱0.02 (the Ice Maker difference).

**Carry-over is live:** an open month's opening balance is the previous month's Final,
computed on the fly back to the first month (or to the last closed month, whose stored
`period_balances.opening_balance` is used). Unpaid amounts therefore carry over
automatically, like the sheet's "Prev Month Unsettled".

**Starting a month** ("Start <next month>" at the bottom of the month picker, on the latest month) creates the next month with
everyone currently active and carries over:

- the bill columns — name, split, Meralco's points and payer — at **₱0.00**
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
- The confirmation lists who is still unsettled, bills still pending, and Manual columns that
  don't add up; none of them block closing.

Back up the database after closing a month (`npm run db:backup`).

## Adding and removing members

- **Adding** someone adds them to every open month. Equal bills re-split; Meralco gives them
  0 points until set; manual bills and columns give them ₱0; they join Advances Shared but
  not situational Auto-equal columns. Re-adding a former member's name reactivates them.
- **Removing** someone deactivates them (left out of future months). In open months where
  they have no advances, payments, bills paid (with an amount above ₱0), typed amounts in a
  Manual bill, or Manual column amounts, they're removed and the bills re-split; where they
  do, they stay so that month's numbers don't change. They also stay in a month they carried
  an unsettled balance into (Prev Month Unsettled ≠ ₱0), so it can't vanish; "Start next
  month" refuses to leave out someone who moved out with an unsettled Final. The collector
  can't be removed.
- A ₱0 bill they're down as paying (copied from the previous month by "Start next month",
  before the real bill arrives) doesn't keep them in: it's handed to the collector and they
  leave that month.

## Email-imported bills

Bills parsed from emails (future feature) arrive with `status = 'pending'` and are ignored
by the settlement until someone confirms them.

## Receipts

`receipt_path` on bills and advances will hold a screenshot (MariBank, Bayad, Maya, GCash)
in a private Supabase Storage bucket — the Receipts tab is laid out and uploads come next.
