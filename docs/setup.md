# First-time setup

Getting My House running on a new machine. Afterwards, day to day you only need
`npm run dev` ([commands.md](commands.md)).

1. **Install dependencies**
   ```bash
   npm install
   ```
   This also installs the git hooks (Husky): lint on every commit, Conventional Commit messages.
2. **Create a Supabase project** at [supabase.com](https://supabase.com) (region:
   Southeast Asia / Singapore).
3. **Add your connection strings**
   ```bash
   cp .env.example .env.local
   ```
   In Supabase, open **Connect → ORMs → Drizzle** and paste the two URLs into `.env.local`:
   - `DATABASE_URL`: the **transaction pooler** (port 6543), used by the app
   - `DIRECT_URL`: the **session pooler** (port 5432), used by migrations, scripts and backups

   `.env.local` is git-ignored: it holds the database password. Never commit it.
4. **Create the tables and add the members**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
   Then load the August 2026 test data with `npm run db:seed:august` ([testing.md](testing.md)).
5. **Start the app**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000). You should see the five household members.

**Optional, once:**
- `pg_dump` for backups: `brew install libpq && brew link --force libpq` ([operations.md → Backups](operations.md#backups)).
- The keep-alive secret on GitHub: `gh secret set DIRECT_URL` ([operations.md → Supabase free plan](operations.md#supabase-free-plan-the-project-goes-to-sleep)).

**After moving or renaming the project folder,** delete `.next/`: its build cache stores
absolute paths.
