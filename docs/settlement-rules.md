# Settlement rules

How MyHouse splits household costs each month. This is the source of truth for
`lib/settlement.ts`, `lib/money.ts` and `db/schema.ts`: change the rules here first,
then the code. The examples use the real August 2026 numbers (from the original
Google Sheet / `App.jsx` prototype), which are also the test fixture in
`lib/__fixtures__/august-2026.ts`.

## Members and the collector

The household has five members: **Ate Toni, Mayee, Skyler, PJ and PA**.

**PA (Paul) is the collector.** Paul pays the core bills to the providers upfront
(Meralco, Water, PLDT Wifi and usually the Helper), and everyone settles up with him.
In the database this is `members.is_collector = true`. Only one member can be the collector.

Members are never deleted, only deactivated (`members.active = false`), so past months
stay intact. Each month has its own member list: the members with a row in
`period_balances` for that month. Splits always use that list, so if someone moves out,
old months don't change.

## Bills vs. advances: which is which

| | **Bill** (`bill_items`) | **Advance** (`advances`) |
|---|---|---|
| What | A recurring utility or service: Meralco, Water, PLDT Wifi, Helper | A one-off household purchase someone paid for: groceries, food, services, misc |
| Who paid | Usually Paul (`paid_by`), sometimes someone else | Whoever bought it (`payer`) |
| Split | Materialized per member in `bill_item_shares`; can be overridden | Equal by default; optional custom split in `advance_shares` |

> **Never log a core bill as an advance.** Paul's bill payments are already covered by
> the bill shares. Adding them to the advances log would count them twice.

## The Month Final formula

For each member:

```
Month Final = bill shares + advance share − own advances paid + bill-payer credit
```

- **Positive** = the member owes that amount (to the collector).
- **Negative** = the member is owed that amount.

This is the same formula as the Google Sheet. The only differences are the centavo
rounding fix and the custom splits described below.

### August 2026 worked example

Bills (all paid by PA): Meralco ₱15,463.59 · Water ₱2,173.63 · PLDT ₱2,699.00 ·
Helper ₱6,400.00 = **₱26,736.22**

| Member | Bill shares | Advance share | Own advances | **Month Final** |
|---|---:|---:|---:|---:|
| Ate Toni | ₱5,347.25 | ₱12,792.51 | ₱5,732.00 | **₱12,407.76** owes |
| Mayee | ₱5,347.25 | ₱12,792.51 | ₱3,500.00 | **₱14,639.76** owes |
| Skyler | ₱5,347.24 | ₱12,792.50 | ₱37,851.00 | **−₱19,711.26** is owed |
| PJ | ₱5,347.23 | ₱12,792.50 | ₱13,636.40 | **₱4,503.33** owes |
| PA | ₱5,347.25 | ₱14,202.88 | ₱4,653.50 | ₱14,896.63 (own share) |

Check: all Month Finals add up to **₱26,736.22**, exactly the bills PA fronted.
That always holds, and it's tested.

## Rounding: everything in centavos

Money is stored as `numeric(12,2)` and all arithmetic is done in whole centavos
(`lib/money.ts`), never with floating-point numbers.

**Equal split.** Divide the total in centavos; the leftover centavos (at most 4 with
five members) go one each to members in this order: **the collector first**, then by
`sort_order`. Paul absorbs the rounding, so it never lands on anyone else.

> Meralco ₱15,463.59 ÷ 5 = 3,092.718 → PA, Ate Toni, Mayee and Skyler pay ₱3,092.72;
> PJ pays ₱3,092.71. Total: exactly ₱15,463.59.
>
> (The prototype rounded each share with `toFixed(2)`: 5 × ₱3,092.72 = ₱15,463.60,
> one centavo more than the actual bill.)

**Overrides.** Any member's bill share can be set manually (`is_override = true`),
including to ₱0. If the bill total changes later, overridden shares stay as they are
and the remainder is re-split equally among the rest (`resplitBill`). Shares must
always add up exactly to the bill total, or the settlement refuses to compute.

## Advances

**Default: equal split.** All equal-split advances for the month are pooled and the
pool is split once among the month's members (same as the prototype's
`totalSharedAdvances / 5`).

**Custom split.** An advance that isn't shared equally gets rows in `advance_shares`
that add up exactly to its amount.

> **Ice Maker** ₱3,761.00, paid by PA: PA carries half (₱1,880.50) and the other four
> split the other half (Ate Toni ₱470.13, Mayee ₱470.13, Skyler ₱470.12, PJ ₱470.12).
> Weights PA 4 : others 1 each.

This replaces the prototype's separate "Ice Maker Adj." column, which was stored but
never actually counted.

## When someone other than Paul pays a bill

Sometimes another member pays the Helper. `bill_items.paid_by_id` records who paid.
The payer is credited the full bill and the collector takes it on instead:

> Skyler pays the ₱6,400 Helper. Skyler's share is ₱1,280, so Skyler's bill-payer credit is
> −₱6,400 and Skyler's Month Final goes down by ₱6,400. PA's goes up by ₱6,400.
> Everyone else is unchanged.

When Paul pays (the usual case), there's no credit and nothing changes.

## Payments, carry-over and closing a month

**Payments** (`payments`) record money actually changing hands: "Mayee paid Paul
₱14,639.76 on Sep 3". They can go member → collector, collector → member (paying out
someone who is owed, like Skyler above), or member → member.

**Running balance** for each non-collector:

```
balance = opening balance + Month Final − paid out + received
```

The **collector's balance is always 0**: Paul's Month Final is his own fair share,
which he has already paid by fronting the bills.

**Closing a month** (`billing_periods.status = 'closed'`) locks it:

1. Each member's balance is saved as `period_balances.closing_balance`.
2. Next month's `opening_balance` = that closing balance, so **unpaid amounts carry
   over automatically**, just like the sheet.
3. A closed month can't be edited.

Rules:

- A month can only be closed if the previous month is already closed.
- A closed month can be **reopened** to fix a mistake, but only while the next month
  is still open. Reopening clears the saved closing balances, and the next month's
  opening balance is computed live again.
- While the previous month is still open, the current month's opening balance is
  computed live from it.

"Closed" doesn't mean everyone has paid. It means the month's numbers are final and
anything unpaid has moved to the next month.

## Email-imported bills

Bills parsed from emails (a future feature) arrive with `source = 'email'` and
`status = 'pending'`. **Pending bills are ignored by the settlement** until someone
reviews and confirms them, so a misread amount never silently changes anyone's balance.

## Receipts

`receipt_path` on bills and advances holds the path of a screenshot (MariBank, Bayad,
Maya) in a private Supabase Storage bucket (a future feature). A table for multiple
receipts per item may replace it later.
