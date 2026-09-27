# MyHouse

Family's own finance tracker. It replaces the monthly Google Sheet: utility bills split
across the household, a shared advances log, and a monthly settlement with carry-over.

**How the money is split:** see [docs/settlement-rules.md](docs/settlement-rules.md).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Lucide ·
Drizzle ORM · PostgreSQL on Supabase · Vitest

> ⚠️ There's no login yet. Don't deploy this publicly until auth is added: anyone
> with the URL would see the household's finances.

## Current status

Runs locally against Supabase; not deployed (no login yet).

**Working now**

- **Monthly Split Table** — bill columns (Meralco by points, the rest Auto equal or Manual),
  shared advance columns, Month Final, Prev Month Unsettled carry-over and Final, plus a
  "Who owes what" summary that reads well on a phone. Amounts are edited in place (Enter or
  click away saves, Escape undoes).
- **Advances Log & Report** — every advance and bill paid, grouped by person with subtotals;
  search and filters; log, edit (including moving to another column), delete; "Save & add
  another" for entering many receipts in a row.
- **Manage Columns & People** — bill columns, shared columns (Auto equal ↔ Manual, who
  shares), Meralco points, adding and removing housemates.
- **Months** — month picker, "Start <next month>" (copies bill columns at ₱0), loading
  placeholders while a month loads.
- **How it works** — the household-facing explanation of the rules.

**Not built yet**

- Login / auth (required before any public deploy)
- Receipt uploads (the Receipts tab is laid out only)
- Payments and a settle-up screen (the `payments` table exists; carry-over already uses it)
- Closing / reopening a month
- Email-imported bills (`status = 'pending'` is already ignored by the math)
- A keep-alive job so the free Supabase project doesn't pause

## First-time setup

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Create a Supabase project** at [supabase.com](https://supabase.com) (region:
   Southeast Asia / Singapore).
3. **Add your connection strings**
   ```bash
   cp .env.example .env.local
   ```
   In Supabase, open **Connect → ORMs → Drizzle** and paste the two URLs into `.env.local`:
   - `DATABASE_URL`: the **transaction pooler** (port 6543), used by the app
   - `DIRECT_URL`: the **session pooler** (port 5432), used by migrations and backups
4. **Create the tables and add the members**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
   Then load the August 2026 test data with `npm run db:seed:august`.
5. **Start the app**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000). You should see the five household members.

## Commands

### App

| Command | What it does | When to run it |
|---|---|---|
| `npm run dev` | Starts the dev server at http://localhost:3000 with hot reload | While working on the app |
| `npm run build` | Builds the production version | Before deploying, or to check that everything compiles |
| `npm run start` | Serves the production build (run `build` first) | To test the production build locally |

### Code quality

| Command | What it does | When to run it |
|---|---|---|
| `npm run lint` | Checks code with ESLint | Before a PR (also runs automatically on every commit) |
| `npm run typecheck` | Generates Next.js route types, then type-checks with TypeScript | Before a PR |
| `npm test` | Runs the Vitest unit tests once (money, settlement math, advances log grouping) | After changing anything in `lib/` |
| `npm run test:watch` | Re-runs the tests on every save | While working on `lib/money.ts` or `lib/settlement.ts` |

### Database

| Command | What it does | When to run it |
|---|---|---|
| `npm run db:generate` | Writes a new SQL migration in `drizzle/` from changes to `db/schema.ts` | After editing the schema |
| `npm run db:migrate` | Applies pending migrations to the Supabase database | After `db:generate`, and during first-time setup |
| `npm run db:studio` | Opens Drizzle Studio, a browser UI for viewing and editing the data | To inspect or fix data by hand |
| `npm run db:seed` | Adds the five household members (safe to run repeatedly) | First-time setup |
| `npm run db:seed:august` | Loads August 2026 from the household sheet (bills, points, advances) as test data | First-time setup |
| `npm run db:seed:august -- --replace` | Deletes August 2026 and loads it fresh (only touches that month) | To reset the test data after experimenting |
| `npm run db:backup` | Dumps the database to `backups/myhouse-YYYY-MM-DD.sql` | After closing each month |

## Changing the database schema

1. Edit `db/schema.ts` (and `docs/settlement-rules.md` if a rule changes).
2. `npm run db:generate`: creates a new SQL file in `drizzle/`.
3. **Read the generated SQL** before applying it, especially anything that drops or
   renames columns.
4. `npm run db:migrate`: applies it to Supabase.
5. Commit the schema change and the migration files together.

Always use generate + migrate (versioned SQL files in git), not `drizzle-kit push`.

## Backups

Supabase's free plan has **no automatic backups**, so run `npm run db:backup` after
closing each month. Backups are saved in `backups/`, which is gitignored because they
contain real household data. Keep a copy somewhere safe.

`db:backup` needs `pg_dump` (its version must be at least Supabase's Postgres version):

```bash
brew install libpq
brew link --force libpq
```

## Supabase free plan: the project goes to sleep

Free Supabase projects **pause after 7 days without activity**. Since this app is used
mostly around month-end, expect it to be asleep sometimes. When the app can't reach
the database, open the Supabase dashboard and click **Restore project**. No data is
lost. A weekly keep-alive job is planned.

## Commit conventions

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:`, `docs:` …). This is enforced by a commitlint hook. A
pre-commit hook runs ESLint, so lint errors block the commit.

## Troubleshooting

- **`db:migrate` hangs, then fails with no message** — something is holding a database
  lock, usually a stale connection from `npm run dev` or `db:studio`. Stop both and run it
  again. (Idle connections now close after 20 seconds, so this should be rare.)

## Project layout

```
app/            Next.js routes: /periods/[year]/[month] (4 tabs) and /how-it-works
components/     App components (inline-input.tsx = the shared edit-in-place field)
components/ui/  shadcn/ui components
db/             Drizzle schema (schema.ts) and database clients
drizzle/        Generated SQL migrations (committed)
docs/           Business rules
hooks/          Client hooks (drag-to-scroll for the wide Split Table)
lib/            Money, settlement and advances-log logic + tests
scripts/        Seed and backup scripts
```
