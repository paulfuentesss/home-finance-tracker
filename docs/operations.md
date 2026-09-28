# Operations

Running and looking after My House: database changes, backups, the Supabase free plan,
commits, troubleshooting, where things live, and keeping household data private.

## Changing the database schema

1. Edit `db/schema.ts` (and `docs/settlement-rules.md` if a rule changes).
2. `npm run db:generate`: creates a new SQL file in `drizzle/`.
3. **Read the generated SQL** before applying it, especially anything that drops or
   renames columns.
4. `npm run db:migrate`: applies it to Supabase.
5. Commit the schema change and the migration files together, and add the table or
   migration to [data-model.md](data-model.md).

Always use generate + migrate (versioned SQL files in git), not `drizzle-kit push`.
Every table has RLS enabled with no policies ([decisions.md](decisions.md)); keep
`.enableRLS()` on new tables.

## Backups

Supabase's free plan has **no automatic backups**, so run `npm run db:backup` after
closing each month. Backups are saved in `backups/`, which is git-ignored because they
contain real household data (login emails included). Keep a copy somewhere safe outside the
repo.

Logins live in Supabase's own `auth` schema, not in the backup. After restoring into a **new**
Supabase project, every `members.auth_user_id` points at nothing: set up login again
([setup.md](setup.md) step 5), then re-invite everyone (`npm run auth:invite -- PA …`, the
rest from Manage).

`db:backup` needs `pg_dump` (its version must be at least Supabase's Postgres version):

```bash
brew install libpq
brew link --force libpq
```

## Supabase free plan: the project goes to sleep

Free Supabase projects **pause after 7 days without activity**. When the app can't reach
the database, open the Supabase dashboard and click **Restore project**. No data is lost.

**Keep-alive job** (`.github/workflows/keep-alive.yml`): every Monday and Thursday at
09:00 Manila, GitHub Actions reads one small table so the project never sits idle for 7
days. Setup, once:

```bash
gh secret set DIRECT_URL   # paste the DIRECT_URL value from .env.local
```

- It only runs from the **`main`** branch. To run it by hand: GitHub → **Actions → Keep
  Supabase awake → Run workflow**.
- If the project is already paused, the run fails and GitHub emails you — your cue to click
  **Restore project**.
- GitHub turns off scheduled jobs in public repos after 60 days without commits. It emails
  a warning first; one click re-enables it.
- Supabase doesn't document exactly what counts as activity. If a "your project will be
  paused" email still arrives, the job needs to do more than a read.

## Commit conventions

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:`, `docs:` …). This is enforced by a commitlint hook. A
pre-commit hook runs ESLint, so lint errors block the commit.

Before a PR: `npm run typecheck`, `npm run lint`, `npm test`. The PR template has a
checklist for keeping the docs up to date.

## Troubleshooting

- **`db:migrate` hangs, then fails with no message** — something is holding a database
  lock, usually a stale connection from `npm run dev` or `db:studio`. Stop both and run it
  again. (Idle connections now close after 20 seconds, so this should be rare.)
- **The local site stops responding** — `npm run build` was run while `npm run dev` was up
  (they share `.next/`). Stop the dev server, delete `.next/dev/lock`, start it again.
- More, with fixes: the "Known pitfalls" table in `CLAUDE.md`.

## Project layout

```
proxy.ts        Runs before every page: refreshes the login, sends logged-out visitors to /login
app/            Next.js routes: /periods/[year]/[month] (5 tabs), /how-it-works,
                /login and /auth/callback (sign-in)
.github/        Keep-alive workflow, PR template
components/     App components (inline-input.tsx = the shared edit-in-place field)
components/ui/  shadcn/ui components
db/             Drizzle schema (schema.ts) and database clients
drizzle/        Generated SQL migrations (committed)
docs/           How things work: rules, features, decisions, TODO (this folder)
hooks/          Client hooks (drag-to-scroll for the wide Split Table)
lib/            Money, settlement, month-lock, advances log, bill emails (lib/bill-email/),
                bill import, login (auth.ts, permissions.ts, invites.ts, supabase/) —
                with their tests
scripts/        Seed, backup, bill-email import and invite scripts
```

## Services & accounts

Where My House's pieces live. No credentials here — they're in `.env.local`, GitHub
secrets or a password manager.

| Service | What it's for | Notes |
|---|---|---|
| Supabase (free plan, Singapore) | The Postgres database, and Auth (the logins) | Connection strings and keys in `.env.local`; pauses after 7 idle days (above); login settings in [setup.md](setup.md) step 5 |
| Google Cloud (OAuth client) | "Continue with Google" | Consent screen in Testing mode; members using Google are its test users |
| Sender Gmail (the app's own, not PA's) | Sends the email sign-in codes (Supabase custom SMTP) | 2-Step Verification on; its App Password is only in Supabase's SMTP settings |
| GitHub `paulfuentesss/home-finance-tracker` | Code, PRs, the keep-alive job | **Public**; secret `DIRECT_URL` for the keep-alive job |
| Gmail (PA's) | Where the providers' bill emails arrive | Will forward to the bill inbox address once it exists |
| Inbound email provider, hosting | The bill inbox address; running the app online | Not chosen yet ([TODO.md](TODO.md)) |

## Privacy & security

The app holds household finances, and **this repo is public**, so:

- **Login protects every page and change** ([features/auth.md](features/auth.md)). Go online
  only through the checklist in [TODO.md → Before going online](TODO.md#before-going-online).
- **`SUPABASE_SECRET_KEY` is server-only** — it can create and delete logins. Never give it
  a `NEXT_PUBLIC_` name, never commit it; only `lib/supabase/admin-server.ts` and the invite
  script read it (checked by `lib/actions-guard.test.ts`).
- **File storage (receipts, member pictures):** private buckets, and policies must never grant
  access to every `authenticated` user.
- **Nothing personal in the repo:** no amounts, account numbers, card or payment details,
  phone numbers, or credentials in code, docs or commits. Household specifics go in
  `.private/NOTES.md`, which is git-ignored (keep your own copy of it elsewhere).
- **Test emails are scrubbed** before they're saved as fixtures (account numbers, names,
  phone numbers, tracking links) — see [testing.md](testing.md).
- `.env.local` and `backups/` are git-ignored; check `git status` before committing.
- Screenshots shared for debugging: crop or blur passwords and account numbers first.
