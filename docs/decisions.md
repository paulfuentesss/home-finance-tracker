# Decisions

Choices that shaped My House, and why. Add one whenever a choice has a "why" worth
remembering — including those made in an approved Claude plan (plans are kept outside the
repo). Newest at the bottom. Money rules themselves live in [settlement-rules.md](settlement-rules.md).

Format: `## YYYY-MM-DD — Title`, then **Decision** and **Why** (and **Instead of** only when
there was a real alternative).

## 2026-09-27 — Money in integer centavos
**Decision:** all money math is done in whole centavos (`lib/money.ts`); the database stores
`numeric(12,2)`, which Drizzle returns as strings.
**Why:** floats can't represent ₱0.01 exactly, and splits must always add up to the total.

## 2026-09-27 — The full ledger
**Decision:** everyone's Month Final is their share of everything minus what they paid, bills
paid included, the collector like everyone else; the Finals sum to ₱0.00.
**Why:** it's how the household sheet works, and a sum of ₱0.00 is a built-in check.

## 2026-09-27 — The collector absorbs leftover centavos
**Decision:** equal splits hand leftover centavos out collector-first (`splitOrder`).
**Why:** leftovers never land on someone who didn't choose to collect.

## 2026-09-27 — No public deploy until login
**Decision:** the app runs locally only until login exists.
**Why:** anyone with the URL would see the household's finances.
*Superseded 2026-09-28: login exists; going online follows the checklist in
[TODO.md](TODO.md#before-going-online).*

## 2026-09-27 — Schema changes: generate + migrate, never push
**Decision:** `db:generate` writes versioned SQL, which is read before `db:migrate` applies it.
**Instead of:** `drizzle-kit push`, which changes the database directly with no record or review.
**Why:** every change is reviewable and repeatable, and destructive SQL gets caught.

## 2026-09-27 — RLS on every table, no policies
**Decision:** every table has row-level security enabled with no policies.
**Why:** it blocks Supabase's public Data API; the app connects to Postgres directly and isn't affected.

## 2026-09-28 — Forms submit with `onSubmit` + `startTransition`
**Decision:** inline inputs and dialogs submit through `onSubmit` + `startTransition`.
**Instead of:** `<form action={…}>`.
**Why:** React resets a form after every action, even a failed one, which wiped what was typed.

## 2026-09-28 — Keep-alive via GitHub Actions
**Decision:** a scheduled workflow reads one table twice a week.
**Why:** free Supabase projects pause after 7 idle days, and the app is mostly used around month-end.

## 2026-09-28 — Repo and folder renamed to `home-finance-tracker`
**Decision:** GitHub repo `paulfuentesss/home-finance-tracker` (the old `MyHouse` URL still
redirects), local folder `~/Documents/GitHub/home-finance-tracker`.

## 2026-09-28 — Bills go in the month the provider names
**Decision:** an emailed bill goes into the month named in the email ("Meralco bill for August
2026"); if none is named, the month holding the middle of the billing period.
**Instead of:** the month it arrives, or the billing period's midpoint alone (PLDT has no period).
**Why:** it matches how the household sheet already assigns bills, so switching to email import
double-counts nothing.

## 2026-09-28 — Emailed bills are pending until confirmed, and never overwrite
**Decision:** an emailed bill fills the month's existing ₱0 column as pending; anything that
doesn't fit goes to the Bill Inbox; a pending bill blocks closing its month.
**Why:** parsing can be wrong and amounts can differ from what was paid, so a person checks
each one; a pending bill left in a closed month could never be confirmed.

## 2026-09-28 — Payment fees are added, shared, and kept as a setting
**Decision:** the fixed fee of the usual way of paying each bill is added on import
(`BILL_PAYMENT_FEES`), shared by everyone, noted on the column, and stored per email.
**Instead of:** editing the amount by hand each month, or reading payment-confirmation emails.
**Why:** the sheet already shares the fees; they only change when the way of paying changes;
storing them per email keeps old months stable.

## 2026-09-28 — The repo stays public; household specifics stay out of it
**Decision:** the repo stays public. Docs are generic; household specifics go in a git-ignored
`.private/NOTES.md`. What's already public (the August fixture) stays as it is.
**Instead of:** making the repo private.

## 2026-09-28 — The app is "My House"; the code is `home-finance-tracker`
**Decision:** what the household sees (header, browser tab, pages, later the home-screen icon)
is **"My House"**, spelled that way everywhere. Internal names — repo, folder, `package.json`,
backup files — are `home-finance-tracker`.
**Instead of:** "MyHouse" (was used alongside "My House"), "My House App", or renaming the app
to match the repo.
**Why:** internal names describe the code; the app name should be short and friendly and fit a
phone header and an icon label (iPhone cuts those at about 12 characters). "App" adds nothing
inside the app itself.

## 2026-09-28 — Docs organized by topic, one home each
**Decision:** README is the short front page, CLAUDE.md is Claude's index, and `docs/` holds
one file per topic: features (the only status list), TODO, decisions, rules, data model,
testing, setup, commands, operations.
**Why:** as the project grows nothing gets forgotten, and nothing is written in two places
that can drift apart.

## 2026-09-28 — Login with Supabase Auth: Google or an emailed code
**Decision:** everyone signs in through Supabase Auth, with Google or a 6-digit code sent to
their email ([features/auth.md](features/auth.md)).
**Why:** Supabase is already the database, so there's no new service or cost. A code covers a
member without a Google account, with no password to forget.
**Instead of:** email + password (a reset flow, forgotten passwords), or one shared household
login (no way to tell who did what, or to remove one person).

## 2026-09-28 — Invite-only: sign-ups off, the login made at invite
**Decision:** Supabase sign-ups are off. Inviting a member creates their Supabase login (with
the server-only secret key) and stores its id on the member; every request matches on that
id, never on the email in the token.
**Why:** with sign-ups on, anyone could use the public Supabase API to make the app email
codes to any address through its Gmail. Matching on the id means changing a login's email
can't make it someone else.

## 2026-09-28 — Codes, not magic links
**Decision:** the sign-in email carries a 6-digit code to type in.
**Why:** a link opened from a phone's mail app often lands in a different browser than the
one that asked for it, and the sign-in fails there.

## 2026-09-28 — Two roles: PA edits, housemates log their own advances
**Decision:** the admin (PA) can change everything. Members see everything except Manage, and
can add, edit and delete only advances they paid, only in the month's default column, only
in an open month.
**Why:** PA is the collector and keeps the books; letting housemates log their own receipts
saves him typing, and keeping them to the default column means they can't unbalance a
Manual or situational column.

## 2026-09-28 — A separate Gmail sends the codes
**Decision:** the email codes go out through the app's own Gmail (Supabase custom SMTP), not
PA's.
**Why:** a Gmail App Password opens the whole mailbox, and PA's holds the providers' bill
emails.

## 2026-10-08 — Keep-alive writes and calls the API, not just a read
**Decision:** the keep-alive job stamps a one-row `keep_alive` table and calls Supabase's API
over HTTPS with the publishable key, twice a week.
**Why:** the project paused in early October although the job had read a table on 1 and
5 October — about 7–10 days after the last real use, as if the reads didn't count. Supabase
doesn't document what counts as activity, so the job now does both kinds of thing real use
does.
**Instead of:** a paid plan (no pausing) — overkill for a household app while restoring loses
no data.

## 2026-10-08 — CI checks, and subagents that review rather than build
**Decision:** a GitHub Actions workflow runs typecheck, lint and tests on every PR. Two Claude
Code subagents (`.claude/agents/`) review before a PR: `money-reviewer` checks money and schema
changes against `settlement-rules.md`; `docs-keeper` checks the docs were updated and nothing
private slipped in. Both are read-only; the main session makes every edit.
**Why:** the checks used to run only when someone remembered. A reviewer that starts fresh
doesn't share the blind spots of whoever wrote the change, which matters most for the money
math and for privacy in a public repo.
**Instead of:** subagents building features in parallel — the codebase is small and tightly
connected, so they'd edit the same files and spend most of their time re-learning the project.
Truly separate features can run as separate sessions in their own git worktrees.
