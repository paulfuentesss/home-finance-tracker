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
[TODO.md](TODO.md#going-online).*

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

## 2026-09-28 — A separate Gmail sends the codes (partly replaced 2026-10-09)
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

## 2026-10-08 — One worktree per session, and a startup check
**Decision:** each parallel Claude session works in its own git worktree. A SessionStart hook
(`.claude/hooks/checkout-status.sh`) shows every session the folder's branch, uncommitted
changes, worktrees and open PRs before it starts.
**Why:** two sessions shared one folder; one switched branches mid-task and the other's commit
landed on the wrong branch. Git can't tell whether another session is open, but the traces one
leaves (a feature branch, uncommitted files) can be shown up front.
**Instead of:** blocking `git switch` with a hook — the report plus the CLAUDE.md rule covers
it without getting in the way of normal branch work.

## 2026-10-08 — Receipts: a private bucket, opened through the app
**Decision:** receipt files go in a private Supabase Storage bucket that only the server
reaches (secret key). Pages link to `/receipts/<id>`, which checks the login and redirects to
a link to the file that works for one minute.
**Why:** payment screenshots carry names and account numbers. With no Storage policies, nothing
but the app can read them, and the app's own login rules decide who sees what. A link in the
page that expired would break in a tab left open; the redirect is always fresh.
**Instead of:** a public bucket (anyone with the link), or Storage policies for `authenticated`
users (any Supabase login, not just household members).

## 2026-10-08 — Receipts: shrink images in the browser, check the type on the server
**Decision:** images are redrawn as JPEG in the browser before upload (width capped, height
not); the server accepts only JPEG, PNG and WebP images, judged by the file's first bytes.
**Why:** phone screenshots are 1–3 MB and the free plan has 1 GB; redrawing also drops photo
location data. Capping only the width keeps long screenshots readable. The type the browser
reports can be faked, so the server reads the file itself; the bucket refuses other types too.
**Instead of:** PDFs as well (e.g. e-bills) — dropped to keep it simple: a phone screenshot is
enough proof, and browsers can't reliably show a PDF inside the viewer.

## 2026-10-08 — Receipts: own table, a few per bill or payment; closed months locked
**Decision:** a `receipts` table where each row belongs to exactly one bill or payment
(replacing the unused `receipt_path` columns), with a small cap per bill or payment
(`MAX_RECEIPTS_PER_ITEM`). Proofs follow the month lock: attach or delete
only while the month is open.
**Why:** a bill can need more than one screenshot (e.g. a split payment), and payments are the
"Payment Proofs" the tab is named after. The cap stops a mis-tap from attaching a whole camera
roll, which matters once housemates upload too. Following the lock keeps one rule for everything
in a month.

## 2026-10-09 — Kept out of search engines; icons as static files
**Decision:** every page says `noindex, nofollow` (root metadata) and `app/robots.txt` disallows
everything. The app icons are plain files in `app/` (`icon.svg`, `favicon.ico`,
`apple-icon.png`), not generated by code; `robots.txt` is skipped by the proxy's matcher.
**Why:** it's a private household app, so nothing in it should show up in search. The proxy
sends signed-out requests to `/login` unless the path is skipped; image extensions already are,
so static icons load on the login page, while a generated icon (served at `/apple-icon?…`, no
extension) would be redirected. `robots.txt` has to be readable signed out for crawlers to obey it.

## 2026-10-09 — Text contrast, with the amber buttons as the one exception
**Decision:** grey text is at least zinc-500 and green "to receive" amounts are emerald-700. The
filled buttons stay amber-600 with white text.
**Why:** WCAG AA asks 4.5:1 for normal-size text; zinc-400 (2.6:1) and emerald-600 (3.7:1) fell
short. White on amber-600 is 3.2:1, also short, but it's the app's look and PA prefers it — a
known exception, not an oversight. Icons and borders only need 3:1, which amber-600 meets.
**Instead of:** amber-700 buttons with white text (5:1), or near-black text on amber-600 (5.5:1) —
both tried; PA preferred the original.

## 2026-10-09 — One household Gmail: codes out, bills in
**Decision:** the My House Gmail, a new account replacing the first sender Gmail, both sends
the sign-in codes and receives the Meralco, Manila Water and PLDT bills (and would send
reminders, if those get built).
**Why:** the bills stop depending on PA's personal inbox, and the household has one account
to hand over. The 2026-09-28 worry was the App Password in Supabase opening PA's personal
mailbox; this one holds only household bills. Payment apps stay on PA's accounts (they're
tied to his card and bank), so their receipts still go to him.

## 2026-10-10 — Hosting on Vercel's free plan, a vercel.app address
**Decision:** the app runs on Vercel (Hobby), deploying every merge to `main`, at a free
`*.vercel.app` address. Its environment variables are Production only; preview builds are off
and the functions run in the database's region, both set in `vercel.json` rather than the
dashboard (versioned and reviewed like code). No Vercel–Supabase integration.
**Why:** Vercel builds Next.js with no configuration, and Hobby is meant for personal,
non-commercial use, which a household app is. An own domain isn't needed to launch; it can
come with Resend or the bill inbox. Production-only variables mean a branch build can never
reach the real database, so preview builds would only fail. Running next to the database
avoids a trans-Pacific round trip per query. The integration would add its own variables over
ours for a Supabase project that's already wired up.
**Instead of:** `myhouse.vercel.app`, which was taken; the address is in `.private/NOTES.md`.

## 2026-10-10 — Only `main` deploys, by branch name
**Decision:** `vercel.json` turns deployments on for `main` only (`git.deploymentEnabled`).
**Why:** branch builds have no environment variables, so they'd only fail. Matching the branch
name is Vercel's own switch for this and depends on nothing at build time.
**Instead of:** an `ignoreCommand` of `[ "$VERCEL_ENV" != production ]` — tried first, and it
skipped the production deploy as well (the variable evidently isn't `production` at that step).

## 2026-10-10 — The app says "the admin", not "PA"
**Decision:** household-facing text names the role — "Ask the admin…", "Only the admin can
change this." — never PA by name. "PA" still appears where it's a member's name in the data
(e.g. the "Advances Shared w/o PA" example).
**Why:** PA prefers it, and the text stays right if someone else ever becomes the admin.

## 2026-10-10 — "Preview as a housemate": display only, changes refused
**Decision:** PA can preview the month tabs as a housemate from the account menu. The choice is
a plain browser cookie (`lib/preview.ts`, `lib/preview-browser.ts`); the server honours it
only when the real signed-in member is the admin, and only for what's *shown*: access checks
keep using the real viewer, and `run()` refuses every change while a preview is on (save
buttons are off too).
**Why:** PA needs to check what housemates see without a second login; the test `+` alias stops
working once real addresses are invited. Refusing changes keeps a click in preview from quietly
saving real data as PA (an advance "for" the housemate is something PA is allowed to log). A
cookie rather than a Server Action because it grants nothing — a member who sets it gets
nothing — and it leaves the Server Action list (and its guard test) unchanged.
**Instead of:** "sign in as" impersonation (real member permissions, but a riskier feature for
an admin-only convenience), or a client-only switch (the server-rendered parts — banners,
Manage — wouldn't follow).

## 2026-10-10 — Finished worktrees are removed by one command
**Decision:** `npm run worktrees:clean` (`scripts/worktrees-clean.sh`) removes a worktree and its
branch only when its PR is merged at the folder's current commit, it has no uncommitted changes,
and no process has it as its working folder. The startup check runs the same rules in a
read-only `--check` mode and says how many are finished. Paul runs it; sessions only suggest it.
**Why:** with a session per worktree, finished folders pile up (four at once by the time this was
added), and deleting them in Finder leaves git's records behind. Checking the merged PR's commit,
not "is the branch merged into main", works with GitHub's merge commits and catches work
committed after the merge. The running-process check keeps it from pulling a folder out from
under an open VS Code window, dev server or another session.

## 2026-10-10 — Develop against a local Supabase, not a second cloud project
**Decision:** for development and testing, run Supabase on the laptop (the Supabase CLI, in
Docker) rather than creating a second free cloud project. Not built yet ([TODO.md](TODO.md)).
**Why:** today `localhost` and the live site share one database, so testing touches the
household's real numbers. A local stack is free, unlimited and never pauses. The free plan
allows only two active cloud projects (as of 2026-10), so a test project would use up the last slot that
other apps might need.
