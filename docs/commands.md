# Commands

**Day to day you only need `npm run dev`.** Add `db:generate` → `db:migrate` when the
schema changes, `db:backup` after closing a month, and the code-quality checks before a PR.

**Where they're defined:** the `"scripts"` section of `package.json`. Each entry is a
shortcut: `npm run db:seed` really runs
`tsx --env-file=.env.local scripts/seed.mts`. To add or change a command, edit it there
and update the tables below.

**Why there are so many:** each tool in the stack has its own command-line program, and
each one gets a shortcut or two:

| Tool | What it's for | Its scripts |
|---|---|---|
| Next.js | The web framework | `dev`, `build`, `start` |
| TypeScript | Checks types | `typecheck` |
| ESLint | Catches mistakes and style issues | `lint` |
| Vitest | Unit tests | `test`, `test:watch` |
| Drizzle Kit | Database schema and migrations | `db:generate`, `db:migrate`, `db:studio` |
| tsx + `scripts/` | Runs our own one-off TypeScript scripts | `db:seed`, `db:seed:august`, `db:backup`, `bills:import`, `auth:invite`, `storage:setup`, `storage:backup` |
| Husky | Git hooks | `prepare` (runs automatically) |

The `db:` and `test:` prefixes are just a naming convention for grouping.

**npm quirks worth knowing:**
- `npm test` and `npm start` work without `run`: npm has built-in shortcuts for those two
  names. Every other script needs `npm run <name>`.
- Anything after `--` is passed on to the script instead of npm, e.g.
  `npm run db:seed:august -- --replace`.

## App

| Command | What it does | When to run it |
|---|---|---|
| `npm run dev` | Starts the dev server at http://localhost:3000 with hot reload | While working on the app |
| `npm run build` | Builds the production version | Before deploying, or to check that everything compiles. Stop `dev` first: they share `.next/` and the dev server hangs |
| `npm run start` | Serves the production build (run `build` first) | To test the production build locally |

## Code quality

| Command | What it does | When to run it |
|---|---|---|
| `npm run lint` | Checks code with ESLint | Before a PR (also runs automatically on every commit) |
| `npm run typecheck` | Generates Next.js route types, then type-checks with TypeScript | Before a PR |
| `npm test` | Runs the Vitest unit tests once — everything in `lib/` ([testing.md](testing.md)) | After changing anything in `lib/` |
| `npm run test:watch` | Re-runs the tests on every save | While working on `lib/` |

## Database

| Command | What it does | When to run it |
|---|---|---|
| `npm run db:generate` | Writes a new SQL migration in `drizzle/` from changes to `db/schema.ts` | After editing the schema |
| `npm run db:migrate` | Applies pending migrations to the Supabase database | After `db:generate`, and during first-time setup |
| `npm run db:studio` | Opens Drizzle Studio, a browser UI for viewing and editing the data | To inspect or fix data by hand |
| `npm run db:seed` | Adds the five household members (safe to run repeatedly) | First-time setup |
| `npm run db:seed:august` | Loads August 2026 from the household sheet (bills, points, advances) as test data | First-time setup |
| `npm run db:seed:august -- --replace` | Deletes August 2026 (its bill emails and receipt files too) and loads it fresh; only touches that month | To reset the test data after experimenting |
| `npm run db:backup` | Dumps the database to `backups/home-finance-tracker-YYYY-MM-DD.sql` | After closing each month |

## Receipt files

| Command | What it does | When to run it |
|---|---|---|
| `npm run storage:setup` | Creates the private `receipts` Storage bucket, or puts its settings back (private, size limit, allowed types). Safe to run again | First-time setup, or after changing `MAX_RECEIPT_BYTES` / `RECEIPT_TYPES` in `lib/receipts.ts` ([features/receipts.md](features/receipts.md)) |
| `npm run storage:backup` | Copies receipt files not backed up yet to `backups/receipts/` | With `db:backup`, after closing each month |

## Email-imported bills

| Command | What it does | When to run it |
|---|---|---|
| `npm run bills:import -- meralco water pldt` | Imports bill emails the way the future inbox address will: the August 2026 sample emails by name, or a `.json` email file (`{ messageId, from, subject, receivedAt, text }`) | Trying the email import locally ([features/email-bills.md](features/email-bills.md)) |

## Login

| Command | What it does | When to run it |
|---|---|---|
| `npm run auth:invite -- PA you@gmail.com` | Gives a member a login for that email (Google or an emailed code), replacing any login they had — the same as typing it in Manage | Once for PA's own login during setup; to change PA's login email; to get back in if it's wrong ([features/auth.md](features/auth.md)) |
| `npm run auth:invite -- <name> --remove` | Takes a member's login away | Rarely — clearing the email in Manage does the same for everyone but PA |

## Working in parallel (git worktrees)

One folder can only be on one branch. To run a second Claude session at the same time, give it
its own folder (a **worktree**): same git history, separate files and branch. Or ask Claude at
the start of a session to "work in a new worktree".

| Command | What it does | When to run it |
|---|---|---|
| `git worktree add ../home-finance-tracker-<task> -b <branch> origin/main` | Makes a new folder next to this one, on a new branch from the latest `main` | Before starting a second session; open the new folder in its own VS Code window |
| `cp ../home-finance-tracker/.env.local . && npm install` | Copies the settings git ignores, installs dependencies | Once, inside the new folder |
| `git worktree list` | Shows every folder and the branch it's on | Any time |
| `npm run worktrees:clean` | Removes every finished worktree and its branch: PR merged, nothing committed after it, no uncommitted changes, nothing running from it (dev server, terminal, VS Code, a Claude session). Lists what it kept and why | After PRs merge — the startup check says when some are finished. Close their VS Code windows first |
| `npm run worktrees:clean -- --dry-run` | Shows what it would remove, removes nothing | When unsure |
| `git worktree remove ../home-finance-tracker-<task>` | Deletes one folder by hand (the branch stays) | Rarely — e.g. abandoned work with no PR |

All folders share one database, and the second `npm run dev` gets port 3001. Don't delete a
worktree folder in Finder: git keeps a record of it and its branch stays locked
(`git worktree prune` clears that; `worktrees:clean` runs it too).

## Automatic (you never run these)

| Script | What it does | When it runs |
|---|---|---|
| `prepare` | Installs the Husky git hooks: `pre-commit` runs ESLint, `commit-msg` enforces Conventional Commits (`feat:`, `fix:`, …) | After every `npm install` |
