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
| `bill_items` | A bill column in a month: total, payer, split mode, dates, `source` (manual / email), `status` (confirmed / pending) | [split table](features/split-table.md), [manage](features/manage.md), [email bills](features/email-bills.md) |
| `bill_item_shares` | A member's share of a bill (and points, for Meralco) — materialized, always sums to the total | [split table](features/split-table.md) |
| `shared_columns` | A shared-advances column in a month (Auto equal or Manual; one default per month) | [advances](features/advances.md), [manage](features/manage.md) |
| `shared_column_members` | Who shares an Auto equal column, or a member's typed amount in a Manual one | [advances](features/advances.md), [manage](features/manage.md) |
| `advances` | A purchase a member paid for the household, in one shared column | [advances](features/advances.md) |
| `payments` | Money changing hands to settle up | [settle up](features/settle-up.md) |
| `bill_emails` | A bill email received: parsed values, payment fee, status (imported / unmatched / dismissed), the bill it filled | [email bills](features/email-bills.md) |
| `keep_alive` | One row: when the keep-alive job last wrote. Not used by the app | [operations](operations.md#supabase-free-plan-the-project-goes-to-sleep) |

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

The logins themselves live in Supabase's `auth.users` (managed by Supabase, not by these
migrations); `members.auth_user_id` points at one.
