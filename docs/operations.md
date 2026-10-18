# Operations

Running and looking after My House: database changes, backups, the Supabase free plan,
commits, troubleshooting, where things live, and keeping household data private.

## One database: localhost is live data

There is one Supabase project. `npm run dev`, the scripts (`auth:invite`, `db:migrate`, …) and
the live site all use the same database, logins and receipt files.

- Whatever you add, edit or delete on `localhost` the household sees on the live site at once.
- The test-data scripts (`db:seed:august`, `bills:import` with its sample emails) refuse to
  run here: they load a made-up August and run only against a local database
  (`lib/local-database.ts`).
- `npm run db:migrate` changes the live database immediately, before the code that needs the
  change is merged — see the next section for the safe order. The exception so far is
  `0012_house-budget`, which runs *after* its deploy ([decisions.md](decisions.md), 2026-10-12).

This is by choice — one database plus backups, no separate test database
([decisions.md](decisions.md)). So when trying something out on `localhost`:

- Use something easy to spot and remove (an advance called "TEST"), and delete it afterwards.
- Avoid actions that are hard to undo on real months: closing a month, removing a member,
  deleting a bill that has proof.
- Before anything risky, and before every `db:migrate`, run `npm run db:backup`.

## Changing the database schema

1. Edit `db/schema.ts` (and `docs/settlement-rules.md` if a rule changes).
2. `npm run db:generate`: creates a new SQL file in `drizzle/`.
3. **Read the generated SQL** before applying it, especially anything that drops or
   renames columns.
4. `npm run db:migrate`: applies it to Supabase — **the live database**. Adding a table or a
   column (nullable, or with a default) is safe: the live site ignores it until the new code
   is deployed. Dropping or renaming breaks the live site until then, so do it in two steps
   (add the new, deploy, then remove the old) and run `npm run db:backup` first.
5. Commit the schema change and the migration files together, and add the table or
   migration to [data-model.md](data-model.md).

Always use generate + migrate (versioned SQL files in git), not `drizzle-kit push`.
Every table has RLS enabled with no policies ([decisions.md](decisions.md)); keep
`.enableRLS()` on new tables.

## Backups

Supabase's free plan has **no automatic backups**, and there is only one database, so backups
are the safety net. Take one **after closing each month** and **before every `db:migrate`**.
Two ways, both covering the database and the receipt pictures:

- **From the site (any device):** Manage → **Download backup**. Your browser saves
  `home-finance-tracker-backup-YYYY-MM-DD.zip`: a `.sql` file with every row, and `receipts/`
  with every picture. Admin only. After a month is started or closed, the month pages show the
  admin a reminder until a download finishes ([months.md](features/months.md)).
- **From the laptop:**
  ```bash
  npm run db:backup        # the database → backups/home-finance-tracker-YYYY-MM-DD.sql
  npm run storage:backup   # receipt files → backups/receipts/ (only new ones are downloaded)
  ```
  `backups/` is git-ignored. Run these from the main folder: they write to `backups/` in the
  folder they run from, and a worktree's is deleted with it.

Either way the files hold real household data (login emails, payment screenshots): keep a copy
somewhere safe off the laptop (a cloud drive), never in the repo. Don't automate them with
GitHub Actions: workflow artifacts on a public repo can be downloaded by others.

### Restoring

Into an **empty** database, e.g. a new Supabase project. Restoring into one that already has
rows fails on the first duplicate and changes nothing.

**The site's zip.** Its `.sql` holds rows only; the tables come from `drizzle/`. The schema
must match the backup's, so use the commit written at the top of the `.sql`:

```bash
git checkout <commit from the .sql header>
npm run db:migrate                                   # creates the tables
psql "$DIRECT_URL" -q -f home-finance-tracker-data-YYYY-MM-DD.sql
git checkout main && npm run db:migrate              # catch up to today's schema
```

`psql` comes with `libpq` (below). The `.sql` is one transaction: if anything fails, nothing
is written.

**The laptop's `db:backup` file** has the tables too: `psql "$DIRECT_URL" -f <file>` into the
empty database (no migrate first).

**Receipt pictures** (either backup): `npm run storage:setup` (new project only), then
`npm run storage:restore -- <folder>/receipts`. It uploads each picture under its original name,
which the `receipts` table refers to. It only adds missing files and never overwrites or
deletes. `--dry-run` lists what it would upload.

Logins live in Supabase's own `auth` schema, not in either backup. After restoring into a
**new** Supabase project, every `members.auth_user_id` points at nothing: set up login again
([setup.md](setup.md) step 5), then re-invite everyone (`npm run auth:invite -- PA …`, the
rest from Manage).

Devices with notifications on (`push_subscriptions`) are in the backup, but only work with the
**same VAPID key pair** ([Push notifications](#push-notifications)). With a new pair, everyone
taps Turn on notifications again.

`db:backup` needs `pg_dump` (its version must be at least Supabase's Postgres version), and
restoring needs `psql`. Both come with `libpq`:

```bash
brew install libpq
brew link --force libpq
```

## Supabase free plan: the project goes to sleep

Free Supabase projects **pause after 7 days without activity**. When the app can't reach
the database (the error mentions "tenant/user … not found"), open the Supabase dashboard
and click **Restore project**. It's back within a few minutes and no data is lost — then
take a backup (`npm run db:backup`).

**Keep-alive job** (`.github/workflows/keep-alive.yml`): every Monday and Thursday at
09:00 Manila, GitHub Actions does what real use does, so the project never sits idle for
7 days:
1. **writes** to the database — stamps the one-row `keep_alive` table, and
2. **calls Supabase's API** over HTTPS with the publishable key (`/auth/v1/health`).

Until October 2026 it only read a table, and the project paused anyway — a read through
the pooler didn't count as activity ([decisions.md](decisions.md)). Supabase doesn't document
what counts, so if it pauses again despite this, the fallback is Restore + a paid plan
decision.

Setup, once — three repository secrets, from `.env.local`:

```bash
gh secret set DIRECT_URL                # the DIRECT_URL value
gh secret set SUPABASE_URL              # the NEXT_PUBLIC_SUPABASE_URL value
gh secret set SUPABASE_PUBLISHABLE_KEY  # the NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY value
```

- It only runs on schedule from the **`main`** branch. To run it by hand: GitHub →
  **Actions → Keep Supabase awake → Run workflow** (or `gh workflow run keep-alive.yml`).
- If the project is already paused, the run fails and GitHub emails you — your cue to click
  **Restore project**.
- GitHub turns off scheduled jobs in public repos after 60 days without commits. It emails
  a warning first; one click re-enables it.

## Commit conventions

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:`, `docs:` …). This is enforced by a commitlint hook. A
pre-commit hook runs ESLint on the whole project (`.husky/pre-commit`, root files like
`proxy.ts` included), so lint errors block the commit.

Before a PR: `npm run typecheck`, `npm run lint`, `npm test`. The PR template has a
checklist for keeping the docs up to date.

## Troubleshooting

- **`db:migrate` hangs, then fails with no message** — something is holding a database
  lock, usually a stale connection from `npm run dev` or `db:studio`. Stop both and run it
  again. (Idle connections now close after 20 seconds, so this should be rare.)
- **The local site stops responding** — `npm run build` was run while `npm run dev` was up
  (they share `.next/`). Stop the dev server, delete `.next/dev/lock`, start it again.
- More, with fixes: the "Known pitfalls" table in `CLAUDE.md`.

### Bills stop arriving by email

The script emails `NOTIFY_TO` when the app refuses a bill or 3 runs in a row fail. To look:
- **Apps Script → Executions** (signed in as the My House Gmail): each hourly run and its log.
  "Will retry: 401" → the secret differs between the script and Vercel; set the same value in
  both (Vercel needs a redeploy). 5xx or timeouts → the app or Supabase is down (paused?).
- **A thread labelled `my-house/rejected`** — the app said no (the log says why: not from the
  biller, unreadable). A bill forwarded *by hand* always ends here; type it in instead.
- **The bill never got to the My House Gmail** — the biller still sends to the personal Gmail
  and the forwarding filter there is gone, or the email's subject doesn't have the words the
  script searches for (`SEARCHES` in `scripts/gmail/bill-forwarder.gs`; update the pasted copy
  too).
- Imported but not where expected → the Bill Inbox (Manage) says why, with Retry.

**Rotating the secret:** a new `openssl rand -base64 32` in Vercel (then redeploy) and in the
script's Script Properties.

## Project layout

```
proxy.ts        Runs before every page: refreshes the login, sends logged-out visitors to /login
app/            Next.js routes: /periods/[year]/[month] (the sidebar's sections), /how-it-works,
                /login and /auth/callback (sign-in), /receipts/[id] (opens a receipt file),
                /backup (the Download backup zip), /api/bill-email (bills from the Gmail script)
.claude/        Claude Code: review agents (agents/), hooks wired in settings.json (hooks/: the
                startup check, git-guard.sh and edit-overlap.sh for sessions sharing the folder), and
                the commands it may run without asking (settings.json → permissions.allow:
                read-only checks only — typecheck, test, lint, git fetch)
.github/        Workflows (checks on every PR, keep-alive), PR template
components/     App components (inline-input.tsx = the shared edit-in-place field)
components/ui/  shadcn/ui components
db/             Drizzle schema (schema.ts) and database clients
drizzle/        Generated SQL migrations (committed)
docs/           How things work: rules, features, decisions, TODO (this folder)
hooks/          Client hooks (drag-to-scroll for the wide Split Table)
lib/            Money, settlement, month-lock, advances log, bill emails (lib/bill-email/),
                bill import, login (auth.ts, permissions.ts, invites.ts, supabase/),
                receipt files (receipts.ts, receipt-image.ts, receipt-files.ts), the
                Download backup (backup.ts) and its reminder (backup-reminder.ts,
                backup-status.ts) — with their tests
scripts/        Seed, backup, bill-email import, invite and receipt-storage (setup, backup, restore) scripts;
                gmail/ holds the reference copy of the Gmail bill script (it runs in Google Apps Script)
```

## Services & accounts

Where My House's pieces live. No credentials here — they're in `.env.local`, GitHub
secrets or a password manager.

| Service | What it's for | Notes |
|---|---|---|
| Supabase (free plan, Seoul — `ap-northeast-2`) | The Postgres database, Auth (the logins), and Storage (receipt files, private `receipts` bucket; 1 GB on the free plan) | Connection strings and keys in `.env.local`; pauses after 7 idle days (above); login settings in [setup.md](setup.md) step 5 |
| Google Cloud (OAuth client) | "Continue with Google" | Consent screen in Testing mode; members using Google are its test users |
| My House Gmail (the household's own, not PA's) | Sends the email sign-in codes (Supabase custom SMTP) and the app's reminders and bill emails ([below](#emails--reminders)); Meralco, Manila Water and PLDT bills go to it (switching over: [TODO.md](TODO.md)) | 2-Step Verification on; two App Passwords, one each: Supabase's SMTP settings, and the app's `GMAIL_SMTP_APP_PASSWORD`; the bill-email script runs in this account (the row below). Changing it: [setup.md](setup.md) step 5b |
| GitHub `paulfuentesss/home-finance-tracker` | Code, PRs, the keep-alive job | **Public**; secret `DIRECT_URL` for the keep-alive job |
| Vercel (Hobby, project `myhouse`) | Runs the app online | Address in `.private/NOTES.md`; how it's set up: [Hosting](#hosting-vercel) below |
| healthchecks.io (free plan, PA's own email — not the My House Gmail) | Emails PA when the daily job fails or doesn't run ([Emails & reminders](#emails--reminders) step 4) | Gets only a plain GET to the check's URL (`HEALTHCHECK_URL` in Vercel), no household data |
| Google Apps Script "My House bills" (in the My House Gmail's account) | Sends the billers' emails to the app hourly (`scripts/gmail/bill-forwarder.gs`) | Script Properties hold the app address and `BILL_EMAIL_SECRET`; setup and fixing: [setup.md](setup.md) step 7, [below](#bills-stop-arriving-by-email) |

## Hosting (Vercel)

- **Settings in code:** `vercel.json` sets the two that matter, so they're reviewed in PRs and
  can't drift in the dashboard:
  - `regions`: the functions run in Seoul (`icn1`), the database's region, so each query
    doesn't cross an ocean.
  - `git.deploymentEnabled`: only `main` deploys (`*` and `**` cover every other branch name,
    with or without a `/`; when rules overlap, one `true` wins). Branch and PR builds would have
    no environment variables, so they'd fail or show nothing.
- **Deploys:** every merge to `main` goes live by itself in a minute or two.
- **Environment variables** (Settings → Environment Variables), Production only and marked
  Sensitive: `DATABASE_URL` (the session pooler, port 5432), `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `BILL_EMAIL_SECRET` (the
  Gmail script's shared secret; [setup.md](setup.md) step 7), and the email ones
  ([Emails & reminders](#emails--reminders)): `GMAIL_SMTP_USER`, `GMAIL_SMTP_APP_PASSWORD`,
  `CRON_SECRET`, the optional `HEALTHCHECK_URL` (the failure alert, step 4 there), and the push
  keys `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` ([below](#push-notifications)). Not
  `EMAIL_TEST_TO` or `PUSH_TEST` (localhost only; nor `HEALTHCHECK_URL` locally). Not `DIRECT_URL` — only
  scripts and migrations use it, and they run on PA's laptop. A changed value only takes
  effect after a redeploy (Deployments → ⋯ → Redeploy).
- **The address** is also Supabase's **Site URL** and is in its Redirect URLs as
  `https://<address>/**` (Authentication → URL Configuration). Without the `/**`, or with
  the Site URL left on localhost, signing in on the live site ends on `localhost`.
- **A bad deploy:** Deployments → the last good one → **Instant Rollback**, then fix on a branch.
- No Vercel integrations: Supabase is already wired through the variables above.
- **Cron job:** `vercel.json` → `crons` runs the daily reminders ([below](#emails--reminders)).
  Settings → Cron Jobs lists it, with **Run** to try it now; its logs are under the project's
  Logs, filtered to `/api/reminders`.

## Emails & reminders

The app sends its own emails — month-end reminders, each housemate's bill and the follow-ups
while a bill stays unpaid ([features/reminders.md](features/reminders.md)) — from the My House Gmail, over Gmail's SMTP.

**Switching it on** (once):
1. In the My House Gmail: Google Account → Security → **App passwords** → create one named
   "My House app". It's separate from Supabase's, so either can be revoked alone.
2. Vercel (Production, Sensitive), then redeploy:
   - `GMAIL_SMTP_USER` — the My House Gmail address.
   - `GMAIL_SMTP_APP_PASSWORD` — the app password from step 1 (16 letters, no spaces).
   - `CRON_SECRET` — `openssl rand -base64 32`. Vercel sends it to `/api/reminders` itself;
     without it the job answers "not set up" and sends nothing.
3. Check: Settings → Cron Jobs → **Run**. The response lists what was sent (usually nothing,
   mid-month). On Settle Up, the bill-email box shows when it was last sent.
4. **An alert when it fails** (optional, free): at [healthchecks.io](https://healthchecks.io),
   sign up with an address that isn't the My House Gmail, and add a check with the schedule
   **Cron** `0 1 * * *`, time zone **UTC**, grace time **3 hours** (Hobby runs the job any time
   within that hour). Copy its ping URL into Vercel as `HEALTHCHECK_URL` (Production, Sensitive)
   and redeploy. After each run the job pings it — its `/fail` address when an email couldn't be
   sent or the run crashed — and healthchecks.io emails you on a failure, or when no ping came by
   the deadline (the job didn't run at all). The ping carries nothing but the URL.

**Safety switch (one database):** only the live site emails housemates and records what it
sent (`VERCEL_ENV=production`, `lib/email.ts`). On localhost every email goes to
`EMAIL_TEST_TO` instead, with "[test → name]" in the subject — or is only logged when that's
unset — and nothing is written to `reminder_sends`. To try it on localhost, add
`GMAIL_SMTP_USER`, `GMAIL_SMTP_APP_PASSWORD`, `EMAIL_TEST_TO` (your own address) and any
`CRON_SECRET` to `.env.local`, restart `npm run dev`, then:

```sh
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/reminders?today=2026-10-24"
```

`?today=` picks the day (`-24`, `-28`, `-31` for the three October reminders; `2026-11-01`
for the admin's "start November"; a few days after a bill email for its still-unpaid
follow-up — localhost records nothing, so that needs a bill email the live site sent). The live
site ignores it.

**If reminders stop:** healthchecks.io emails you (step 4); without it, the Settle Up box's
"Month-end reminder … sent" line stops moving. Check Vercel's logs for `/api/reminders` (a 503
means `CRON_SECRET` is missing; "Couldn't send" means Gmail refused — a revoked app password, or
the account's sending limit; a database error that can't find the tenant means Supabase paused:
CLAUDE.md → Known pitfalls). A missed day is caught up the next day by itself.

### Push notifications

Pushes ([features/notifications.md](features/notifications.md)) go out alongside some of the
emails, to devices that turned them on. Off until both keys are set; nothing else changes then.

**Switching it on** (once):
1. `npx web-push generate-vapid-keys` prints a public and a private key.
2. Add both to Vercel (Production; mark the private one Sensitive) and redeploy — the public key
   is built into the page, so it only takes effect with a new build:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — the public key.
   - `VAPID_PRIVATE_KEY` — the private key.
3. Put the **same pair** in `.env.local` (the main folder's, and any worktree's): a device's
   subscription only takes pushes signed with the key it was made with. Keep the pair in the
   password manager. **Losing or changing it** means every device stops getting pushes until
   its person taps Turn on notifications again.

**Safety switch (one database):** only the live site pushes, and only to devices that turned
notifications on there (`push_subscriptions.live`). On localhost a push is only logged — or, with
`PUSH_TEST=on` in `.env.local`, sent to the admin's own devices with "[test → name]" in front.
Chrome on a Mac can get pushes from `localhost`: turn them on there, then run the `curl` above.

**If pushes stop:** the device may have dropped its subscription (an app removed, notifications
turned off, a browser reset) — it's deleted when the push service says so, and comes back when
the app is opened with notifications still allowed. Vercel's logs show "Couldn't push to
subscription …" with the push service's answer.

## Privacy & security

The app holds household finances, and **this repo is public**, so:

- **Login protects every page and change** ([features/auth.md](features/auth.md)). What's left
  of going online: [TODO.md → Going online](TODO.md#going-online).
- **`SUPABASE_SECRET_KEY` is server-only** — it can create and delete logins and read every
  receipt file. Never give it
  a `NEXT_PUBLIC_` name, never commit it; only `lib/supabase/admin-server.ts` and the invite
  script read it (checked by `lib/actions-guard.test.ts`).
- **`BILLER_SECRET_KEY` encrypts the Billers tab's passwords** ([features/billers.md](features/billers.md)).
  Server-only; only `lib/biller-secrets.ts` reads it (checked by `lib/actions-guard.test.ts`).
  The same value in `.env.local` and Vercel, and **a copy in a password manager**: without it
  the saved passwords can't be read by anyone, and a restored backup's passwords need it too.
  The database and backups hold only the encrypted form.
- **`GMAIL_SMTP_APP_PASSWORD` sends email as the household** — only `lib/email.ts` reads it,
  and `CRON_SECRET` only `/api/reminders` (both checked by `lib/actions-guard.test.ts`). Each
  bill email goes only to its own housemate, and a view-only login's "the bills are in" note
  carries no amounts; the pages never receive anyone's email address.
- **`HEALTHCHECK_URL` works like a password** — anyone with it could send a fake "all good". Only
  `/api/reminders` reads it, from the live site only (checked by `lib/actions-guard.test.ts`), and
  the ping carries no names, amounts or outcome: just "fine" or `/fail`.
- **`VAPID_PRIVATE_KEY` signs the push notifications** ([features/notifications.md](features/notifications.md)).
  Server-only; only `lib/push.ts` reads it (checked by `lib/actions-guard.test.ts`). Pushes
  carry no amounts and nothing anyone typed: they show on lock screens. A device is saved only
  for its own signed-in member, and only with a known push service's address.
- **File storage (receipts):** a private bucket, and policies must never grant
  access to every `authenticated` user. The app reads and writes receipts with the secret key
  after its own login check; files are shown through `/receipts/<id>`, which redirects to a
  link that works for one minute ([features/receipts.md](features/receipts.md)).
- **Nothing personal in the repo:** no amounts, account numbers, card or payment details,
  phone numbers, or credentials in code, docs or commits. Household specifics go in
  `.private/NOTES.md`, which is git-ignored (keep your own copy of it elsewhere).
- **Test emails are scrubbed** before they're saved as fixtures (account numbers, names,
  phone numbers, tracking links) — see [testing.md](testing.md).
- `.env.local` and `backups/` are git-ignored; check `git status` before committing.
- Screenshots shared for debugging: crop or blur passwords and account numbers first.
