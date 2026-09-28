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
contain real household data. Keep a copy somewhere safe outside the repo.

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
app/            Next.js routes: /periods/[year]/[month] (5 tabs) and /how-it-works
.github/        Keep-alive workflow, PR template
components/     App components (inline-input.tsx = the shared edit-in-place field)
components/ui/  shadcn/ui components
db/             Drizzle schema (schema.ts) and database clients
drizzle/        Generated SQL migrations (committed)
docs/           How things work: rules, features, decisions, TODO (this folder)
hooks/          Client hooks (drag-to-scroll for the wide Split Table)
lib/            Money, settlement, month-lock, advances log, bill emails (lib/bill-email/),
                bill import — with their tests
scripts/        Seed, backup and bill-email import scripts
```

## Services & accounts

Where My House's pieces live. No credentials here — they're in `.env.local`, GitHub
secrets or a password manager.

| Service | What it's for | Notes |
|---|---|---|
| Supabase (free plan, Singapore) | The Postgres database | Connection strings in `.env.local`; pauses after 7 idle days (above) |
| GitHub `paulfuentesss/home-finance-tracker` | Code, PRs, the keep-alive job | **Public**; secret `DIRECT_URL` for the keep-alive job |
| Gmail (PA's) | Where the providers' bill emails arrive | Will forward to the bill inbox address once it exists |
| Inbound email provider, hosting | The bill inbox address; running the app online | Not chosen yet — after login ([TODO.md](TODO.md)) |

## Privacy & security

The app holds household finances, and **this repo is public**, so:

- **No public deploy until login exists** — anyone with the URL would see everything.
- **Nothing personal in the repo:** no amounts, account numbers, card or payment details,
  phone numbers, or credentials in code, docs or commits. Household specifics go in
  `.private/NOTES.md`, which is git-ignored (keep your own copy of it elsewhere).
- **Test emails are scrubbed** before they're saved as fixtures (account numbers, names,
  phone numbers, tracking links) — see [testing.md](testing.md).
- `.env.local` and `backups/` are git-ignored; check `git status` before committing.
- Screenshots shared for debugging: crop or blur passwords and account numbers first.
