# Features

Where My House stands. **This table is the only status list**: when a feature lands or changes,
update its row and its page. Not started yet? It's a line in [TODO.md](../TODO.md) until work
begins, then it gets a page here.

✅ Working · 🚧 Partly built · ⏳ Planned

| Feature | Status | What it does | Page |
|---|---|---|---|
| Monthly Split Table | ✅ | Every bill and shared column split per person, Month Final, carry-over, Final; "Who owes what" cards | [split-table.md](split-table.md) |
| Advances | ✅ | Log household purchases into shared columns; per-person report | [advances.md](advances.md) |
| Settle Up | ✅ | Who owes whom, one tap to record a payment | [settle-up.md](settle-up.md) |
| Months | ✅ | Month picker, starting the next month, live carry-over, closing / reopening | [months.md](months.md) |
| Manage Columns & People | ✅ | Bill and shared columns, Meralco points, housemates moving in and out | [manage.md](manage.md) |
| Email-imported bills | 🚧 | Bill emails become Pending bills with the payment fee added; Bill Inbox. Missing: the inbox address (after login) | [email-bills.md](email-bills.md) |
| Receipts | 🚧 | Tab laid out; uploads not built | [receipts.md](receipts.md) |

Also running, not features of the app itself:
- **How it works page** (`/how-it-works`) — the household-facing explanation of the rules;
  it must change whenever a rule does ([settlement-rules.md](../settlement-rules.md)).
- **Keep-alive job** — keeps the free Supabase project awake ([operations.md](../operations.md#supabase-free-plan-the-project-goes-to-sleep)).

## Page template

Every feature page uses the same headings: **Status** · **What it does** · **How it's built**
· **Rules** · **Open items** · **Built in**.

## Glossary

| Term | Meaning |
|---|---|
| **Collector** | The member who pays the core bills upfront and whom everyone settles with (PA). Absorbs leftover centavos. |
| **Bill column** | A bill in the Split Table (Meralco, Water, PLDT Wifi, Helper, …), split equally, by points or manually. |
| **Shared column** | A column of advances split among who shares it ("Advances Shared", "w/o PA", a Manual one). |
| **Advance** | A household purchase one member paid for themselves; logged into a shared column. |
| **Points** | Meralco's split: each member's share of electricity use. |
| **Own Adv (−)** | What a member paid this month: their advances plus bills they paid. |
| **Month Final** | Share of everything − what they paid. Positive = owes, negative = is owed. Everyone's sums to ₱0.00. |
| **Prev Month Unsettled** | Last month's Final, carried over. |
| **Final** | Prev Month Unsettled + Month Final − paid out + received. What's left to settle. |
| **Closed month** | Locked; Finals saved as the next month's opening balances. |
| **Pending bill** | Filled in from a bill email; not counted until confirmed. |
| **Bill Inbox** | Bill emails that couldn't go straight into a month, with the reason. |
