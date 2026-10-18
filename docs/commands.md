# Commands

**Day to day you only need `npm run dev`.** Add `db:generate` → `db:migrate` when the
schema changes, a backup after closing a month, and the code-quality checks before a PR.

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
| tsx + `scripts/` | Runs our own one-off TypeScript scripts | `db:seed`, `db:seed:august`, `db:backup`, `bills:import`, `auth:invite`, `storage:setup`, `storage:backup`, `storage:restore` |
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
| `npm run dev` | Starts the dev server with hot reload (`scripts/dev.sh`): http://localhost:3000 in the main folder; in a worktree, the first free port from 3001, with the worktree's name in the tab title. Refuses if that folder's server is already running, and says where | While working on the app |
| `npm run build` | Builds the production version | CI runs it on every PR; locally, to check that everything compiles. Stop that folder's `dev` first: they share `.next/` and the dev server hangs |
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
| `npm run db:seed` | Adds the collector, PA, so there's someone to invite and sign in as; everyone else is added in Manage. Safe to run repeatedly, on any database | First-time setup |
| `npm run db:seed:august` | Loads the made-up August 2026 (its members, bills, points, advances) as test data. **Local database only** — refuses the live one | Only with a local database (none by choice: [decisions.md](decisions.md)) |
| `npm run db:seed:august -- --replace` | Deletes August 2026 (its bill emails and receipt files too) and loads it fresh; only touches that month. Local only | To reset the local test data after experimenting |
| `npm run db:backup` | Dumps the database to `backups/home-finance-tracker-YYYY-MM-DD.sql` | After closing each month |

## Receipt files

| Command | What it does | When to run it |
|---|---|---|
| `npm run storage:setup` | Creates the private `receipts` Storage bucket, or puts its settings back (private, size limit, allowed types). Safe to run again | First-time setup, or after changing `MAX_RECEIPT_BYTES` / `RECEIPT_TYPES` in `lib/receipts.ts` ([features/receipts.md](features/receipts.md)) |
| `npm run storage:backup` | Copies receipt files not backed up yet to `backups/receipts/` | With `db:backup`, after closing each month |
| `npm run storage:restore -- <folder>` | Uploads receipt pictures from a backup's `receipts/` folder back into the bucket under their original names. Only adds missing files; `--dry-run` lists them | Restoring a backup ([operations.md → Backups](operations.md#restoring)) |

## Email-imported bills

| Command | What it does | When to run it |
|---|---|---|
| `npm run bills:import -- meralco water pldt` | Imports bill emails the way the Gmail script does: the made-up August 2026 sample emails by name (**local database only**), or a `.json` email file (`{ messageId, from, subject, receivedAt, text }`, any database) | Importing a real email file by hand, e.g. one the Gmail script couldn't send ([features/email-bills.md](features/email-bills.md)); the samples need a local database |

## Login

| Command | What it does | When to run it |
|---|---|---|
| `npm run auth:invite -- PA you@gmail.com` | Gives a member a login for that email (Google or an emailed code), replacing any login they had — the same as typing it in Manage | Once for PA's own login during setup; to change PA's login email; to get back in if it's wrong ([features/auth.md](features/auth.md)) |
| `npm run auth:invite -- <name> --remove` | Takes a member's login away | Rarely — clearing the email in Manage does the same for everyone but PA |

## Working in parallel

**One task, one worktree, one local site, one PR.** Each Claude session works on its own task in
its own folder (a **worktree**: the same git history, but separate files on a separate branch),
branched fresh from GitHub's `main`. When the task is done, that session raises its own PR.
Sessions never share files, so they can't trip over each other.

How a session goes (Claude does all of it; the rules are in `CLAUDE.md` → Parallel sessions):

1. **Start.** Open a Claude session in the main folder (`home-finance-tracker`). The startup
   check lists every worktree with its branch, local site and PR. Claude runs
   `npm run worktree:new -- <name>`, which makes `../home-finance-tracker-<name>` on
   `feat/<name>`, then moves the session into it. To continue a task, tell Claude which one; it
   moves into that task's folder.
2. **Look at it.** `npm run dev` in a worktree serves it on the first free port from 3001 and
   prints the address. Claude gives you the link. The browser tab reads `[<name>] My House`, so
   you can tell the sites apart. `localhost:3000` is the main folder, showing `main`.
3. **Raise the PR.** Ask that session. It commits only its own changes, brings in the latest
   `main` and fixes any conflicts. Then it runs the checks, pushes and opens the PR. Last, it asks
   GitHub whether the PR can merge cleanly and how the checks went. If there's a conflict, it fixes
   it and pushes again, then tells you the PR's state.
4. **After the merge.** The next session's startup check sees the finished worktree and removes
   it (`worktrees:clean`, which also stops its local site), and tidies up merged branches.

What keeps it safe:
- A hook blocks git commands that throw away uncommitted changes or switch a folder's branch
  (`.claude/hooks/git-guard.sh`; you can still run them yourself in a terminal). The one
  allowed switch is `git switch main`, to put the main folder back on `main`.
- When a session is about to edit a file another session changed in the last hour, it's told,
  in any worktree (`.claude/hooks/edit-overlap.sh`). Their PRs will probably conflict on that
  file, so each keeps to its own part. It doesn't ask you: the prompts got in the way.
- Giving each session a separate part of the app still means fewer conflicts.

| Command | What it does | When to run it |
|---|---|---|
| `npm run worktree:new -- <name> [branch]` | Fetches `main` and makes `../home-finance-tracker-<name>` on a new branch from `origin/main` (default `feat/<name>`). Links `.env.local` and `.private` to the main folder's (one file each, so a change there reaches every worktree) and installs dependencies | At the start of every task (Claude runs it). Open the folder in its own VS Code window if you want to look at the code |
| `git worktree list` | Shows every folder and the branch it's on | Any time (the startup check shows more) |
| `npm run worktrees:clean` | Removes every finished worktree and its branch: PR merged, nothing committed after it, no uncommitted changes, nothing running from it except its own dev server (which it stops first). Never a folder a terminal, VS Code or Claude session is in. Lists what it kept and why | When the startup check says "Finished worktrees" — Claude runs it itself. Close their VS Code windows first |
| `npm run worktrees:clean -- --dry-run` | Shows what it would remove, removes nothing | When unsure |
| `npm run branches:clean` | Brings `main` up to date with GitHub (the main folder too, when it's on `main` with no changes), drops `origin/*` names for branches GitHub deleted, and removes every local branch whose PR is merged and that has nothing committed after the merge. Never `main` or a branch open in a folder. Lists what it kept and why | When the startup check says "Merged branches still here" — Claude runs it itself |
| `npm run branches:clean -- --dry-run` | Shows what it would remove, removes nothing | When unsure |
| `git worktree remove ../home-finance-tracker-<task>` | Deletes one folder by hand (the branch stays) | Rarely — e.g. abandoned work with no PR |

All folders share one database — the live one ([operations.md](operations.md#one-database-localhost-is-live-data)),
so only one task at a time changes the schema. Backups run from the main folder (a worktree's
`backups/` goes when it's removed). Don't delete a worktree folder in Finder: git keeps a record
of it and its branch stays locked (`git worktree prune` clears that; `worktrees:clean` runs it
too).

**Signing in on a worktree's site:** a sign-in on any `localhost` port carries to the others, so
you're usually signed in already. Signing in fresh there needs that port in Supabase's Redirect
URLs ([setup.md](setup.md) step 5), or it ends on the live site.

## Automatic (you never run these)

| Script | What it does | When it runs |
|---|---|---|
| `prepare` | Installs the Husky git hooks: `pre-commit` runs ESLint, `commit-msg` enforces Conventional Commits (`feat:`, `fix:`, …) | After every `npm install` |
