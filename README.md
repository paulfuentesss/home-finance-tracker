# My House

A household's own finance tracker, replacing a monthly Google Sheet: utility bills split
across the household, a shared advances log, and a monthly settlement with carry-over.
Bill emails (Meralco, Water, PLDT) come in as pending bills to confirm.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Lucide ·
Drizzle ORM · PostgreSQL on Supabase · Vitest

Everyone signs in with Google or an emailed code; only invited household members get in
([docs/features/auth.md](docs/features/auth.md)).

**Status:** runs locally against Supabase; not deployed yet. Feature by feature:
[docs/features](docs/features/README.md). What's next: [docs/TODO.md](docs/TODO.md).

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase URLs and keys (see docs/setup.md)
npm run db:migrate && npm run db:seed && npm run db:seed:august
npm run auth:invite -- PA you@gmail.com   # after login setup (docs/setup.md step 5)
npm run dev                  # http://localhost:3000
```

## Docs

| Doc | What's in it |
|---|---|
| [features/](docs/features/README.md) | Every feature: status, what it does, how it's built · glossary |
| [TODO.md](docs/TODO.md) | Everything not done yet, and the checklist for going online |
| [settlement-rules.md](docs/settlement-rules.md) | How the money is split — the source of truth for the math |
| [decisions.md](docs/decisions.md) | Choices we made and why |
| [data-model.md](docs/data-model.md) | The database tables and migrations |
| [testing.md](docs/testing.md) | Tests, fixtures, resetting test data, trying features by hand |
| [setup.md](docs/setup.md) | First-time setup |
| [commands.md](docs/commands.md) | Every `npm run` command and when to use it |
| [operations.md](docs/operations.md) | Schema changes, backups, Supabase sleep, commits, troubleshooting, layout, services, privacy |

For Claude: `CLAUDE.md` (project rules, known pitfalls, how to keep these docs up to date).
