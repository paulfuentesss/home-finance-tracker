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
| tsx + `scripts/` | Runs our own one-off TypeScript scripts | `db:seed`, `db:seed:august`, `db:backup`, `bills:import` |
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
| `npm run db:seed:august -- --replace` | Deletes August 2026 (and its bill emails) and loads it fresh; only touches that month | To reset the test data after experimenting |
| `npm run db:backup` | Dumps the database to `backups/myhouse-YYYY-MM-DD.sql` | After closing each month |

## Email-imported bills

| Command | What it does | When to run it |
|---|---|---|
| `npm run bills:import -- meralco water pldt` | Imports bill emails the way the future inbox address will: the August 2026 sample emails by name, or a `.json` email file (`{ messageId, from, subject, receivedAt, text }`) | Trying the email import locally ([features/email-bills.md](features/email-bills.md)) |

## Automatic (you never run these)

| Script | What it does | When it runs |
|---|---|---|
| `prepare` | Installs the Husky git hooks: `pre-commit` runs ESLint, `commit-msg` enforces Conventional Commits (`feat:`, `fix:`, …) | After every `npm install` |
