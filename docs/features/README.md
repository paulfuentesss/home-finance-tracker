# Features

Where My House stands. **This table is the only status list**: when a feature lands or changes,
update its row and its page. Not started yet? It's a line in [TODO.md](../TODO.md) until work
begins, then it gets a page here.

✅ Working · 🚧 Partly built · ⏳ Planned

| Feature | Status | What it does | Page |
|---|---|---|---|
| Monthly Split Table | ✅ | Every bill and shared column split per person, Month Final, carry-over, Final, a House Budget row; "Who owes what" cards | [split-table.md](split-table.md) |
| Advances | ✅ | Log household purchases into shared columns; per-person report | [advances.md](advances.md) |
| Helper | ✅ | Her visits and early pay: whoever paid her gets it back, the Helper column fills in by itself, and what she owes carries across months | [helper.md](helper.md) |
| Settle Up | ✅ | Who owes whom, settled through the House Budget; PA records a payment in one tap, a housemate sends theirs with “I paid” and a screenshot for PA to confirm | [settle-up.md](settle-up.md) |
| Months | ✅ | Month picker, the next month starting by itself (or by hand), live carry-over, locked for housemates once it ends, closing / reopening, the backup reminder | [months.md](months.md) |
| Reminders & bill emails | ✅ | Emails housemates before the month ends and on its last day to log their expenses; starts the next month by itself; the admin emails everyone their own bill from Settle Up and is nudged when it's time to email or close; matching banners | [reminders.md](reminders.md) |
| Manage Columns & People | ✅ | Bill and shared columns, Meralco points, housemates moving in and out, who's using it (last seen, app or web), Download backup | [manage.md](manage.md) |
| Login | ✅ | Google or an emailed code; invite-only; the admin edits everything, housemates log their own advances and Helper visits; view-only logins only look; the admin can preview as a housemate | [auth.md](auth.md) |
| Email-imported bills | 🚧 | Bill emails, sent hourly by a script in the My House Gmail, become Pending bills with the payment fee added; Bill Inbox. Waiting for its first real bill | [email-bills.md](email-bills.md) |
| Receipts | ✅ | Proof (screenshots) on each bill and payment, in a private bucket; the admin attaches | [receipts.md](receipts.md) |
| Install as an app | ✅ | Installs on phones and computers and opens full-screen from the home screen; an Install card (instructions on iPhone); a "No connection" screen. Not offline yet | [install-app.md](install-app.md) |
| Billers & Accounts | ✅ | Each company the household pays, with account numbers, how it's paid, links and passwords (encrypted, revealed on tap); the admin edits, housemates see what's shared | [billers.md](billers.md) |

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
| **Collector** | The member who pays the core bills upfront and looks after the House Budget (PA). Absorbs leftover centavos; gets what's left in the House Budget once everyone else is settled. |
| **House Budget** | The household's collection account: housemates pay into it, the collector pays out of it. A side of a payment, not a member ([rules](../settlement-rules.md#house-budget)). |
| **Admin / member / view only** | Login roles ([auth.md](auth.md)). The admin (PA) can change everything; members see everything and manage their own advances; a view-only login sees what members see, changes nothing, and is in no month, so shares in no cost. |
| **Invite** | A member's login email, set in Manage. Only invited emails can sign in. |
| **Bill column** | A bill in the Split Table (Meralco, Water, PLDT Wifi, Helper, …), split equally, by points or manually. |
| **Daily pay / early pay** | The Helper's pay for a visit / money given to her before she works, which she owes until it's taken off her daily pay ([helper.md](helper.md)). |
| **Shared column** | A column of advances split among who shares it ("Advances Shared", "w/o PA", a Manual one). |
| **Advance** | A household purchase one member paid for themselves; logged into a shared column. |
| **Points** | Meralco's split: each member's share of electricity use. |
| **Own Adv (−)** | What a member paid this month: their advances plus bills they paid. |
| **Month Final** | Share of everything − what they paid. Positive = owes, negative = is owed. Everyone's sums to ₱0.00. |
| **Prev Month Unsettled** | Last month's Final, carried over. |
| **Final** | Prev Month Unsettled + Month Final − paid out + received. What's left to settle. |
| **Ended month** | Its last day has passed: locked for housemates, the admin can still change it until it's closed. |
| **Closed month** | Locked; Finals saved as the next month's opening balances. |
| **Pending bill** | Filled in from a bill email; not counted until confirmed. |
| **Bill Inbox** | Bill emails that couldn't go straight into a month, with the reason. |
