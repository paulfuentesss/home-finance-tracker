# Data model

The database tables at a glance. The definitions (columns, constraints, comments) are in
`db/schema.ts`; the rules behind them in [settlement-rules.md](settlement-rules.md). Money is
`numeric(12,2)` everywhere and comes back from Drizzle as a string — convert with `toCentavos`.

Every table has RLS enabled with no policies, which blocks Supabase's public Data API; the app
connects directly ([decisions.md](decisions.md)).

## Tables

| Table | One row is… | Used by |
|---|---|---|
| `members` | A household member. Deactivated, never deleted; at most one `is_collector`. Login: `email` (the invite, lowercase), `auth_user_id` (their Supabase login — what every request matches on), `role` (`admin` / `member`) | [manage](features/manage.md), [login](features/auth.md) |
| `billing_periods` | A month (`year`, `month`), `open` or `closed` | [months](features/months.md) |
| `period_balances` | A member in a month: that month's membership, opening and closing balance | [months](features/months.md), [split table](features/split-table.md) |
| `bill_items` | A bill column in a month: total, payer, split mode, dates, `source` (manual / email), `status` (confirmed / pending), `kind` (`helper` marks the Helper column, at most one per month) | [split table](features/split-table.md), [manage](features/manage.md), [email bills](features/email-bills.md) |
| `bill_item_shares` | A member's share of a bill (and points, for Meralco) — materialized, always sums to the total | [split table](features/split-table.md) |
| `shared_columns` | A shared-advances column in a month (Auto equal or Manual; one default per month) | [advances](features/advances.md), [manage](features/manage.md) |
| `shared_column_members` | Who shares an Auto equal column, or a member's typed amount in a Manual one | [advances](features/advances.md), [manage](features/manage.md) |
| `advances` | A purchase a member paid for the household, in one shared column | [advances](features/advances.md) |
| `helper_entries` | Something handed to the Helper in a month: a `visit` (daily pay, part maybe taken off her debt), `early_pay`, or her `opening` debt from the sheet (no payer, in no bill) | [helper](features/helper.md) |
| `payments` | Money changing hands to settle up; `status` (confirmed / pending = a housemate's "I paid" waiting for PA / rejected, with `rejected_reason`) | [settle up](features/settle-up.md) |
| `receipts` | A proof image (screenshot or photo) for exactly one bill or payment: its name in the private `receipts` Storage bucket, type, size, who uploaded it | [receipts](features/receipts.md) |
| `bill_emails` | A bill email received: parsed values, payment fee, status (imported / unmatched / dismissed), the bill it filled | [email bills](features/email-bills.md) |
| `billers` | A company the household pays (electricity, water, internet…): its name and place on the Billers tab. Not tied to a month | [billers](features/billers.md) |
| `biller_fields` | A line on a biller's card: `kind` (`text` / `link` / `secret` / `heading`), label, `value` — or, for a password, `secret_value`, only ever encrypted (checks keep a password out of `value`) — and `housemates_can_see` | [billers](features/billers.md) |
| `keep_alive` | One row: when the keep-alive job last wrote. Not used by the app | [operations](operations.md#supabase-free-plan-the-project-goes-to-sleep) |
| `backups` | A Download backup that finished: when, and who took it. Turns off the backup reminder | [months](features/months.md), [operations](operations.md#backups) |

## Migrations

In `drizzle/`, applied in order with `npm run db:migrate` ([operations.md](operations.md#changing-the-database-schema)).
Add a line here with every new one.

| Migration | What it did |
|---|---|
| `0000_init` | The first tables: members, months, bills and shares, advances, balances |
| `0001_split-modes-pools-dates` | Bill split modes and Meralco points, date paid, who each advance is shared with |
| `0002_shared-columns` | Shared columns and who shares them (replacing per-advance sharing); every advance belongs to a column |
| `0003_bill-emails` | `bill_emails` (the Bill Inbox) and its enums |
| `0004_bill-email-fees` | Payment fee and note on `bill_emails` |
| `0005_member-logins` | `email`, `auth_user_id` and `role` on `members` (the `member_role` enum); the collector becomes `admin` |
| `0006_keep-alive` | `keep_alive`, the one-row table the keep-alive job writes to |
| `0007_receipts` | `receipts` (proof for bills and payments); drops the never-used `receipt_path` columns on `bill_items` and `advances` |
| `0008_backups` | `backups`, one row per finished Download backup (for the reminder) |
| `0009_payment-status` | `status` (the `payment_status` enum, default `confirmed` so existing payments are unchanged) and `rejected_reason` on `payments`, with a check that only rejected ones have a reason |
| `0010_helper-entries` | `helper_entries` (the `helper_entry_kind` enum) and `kind` on `bill_items` (the `bill_kind` enum, one `helper` per month); existing columns named "Helper" become `helper` |
| `0011_billers` | `billers` and `biller_fields` (the `biller_field_kind` enum) for the Billers tab; adds tables only. Made in parallel with `0010` and renumbered after it; both were applied in this order |

The receipt files themselves live in Supabase Storage (the private `receipts` bucket), not in
the database; `receipts.storage_path` names one.

The logins themselves live in Supabase's `auth.users` (managed by Supabase, not by these
migrations); `members.auth_user_id` points at one.
