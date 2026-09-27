# MyHouse

Household expense tracker replacing a monthly Google Sheet. Next.js 16 App Router,
shadcn/ui, Drizzle ORM on Supabase Postgres, Vitest. Commands are listed in README.md.

The user (Paul, "PA" in the data) is both the developer and the household's
**collector**: he pays the core bills upfront and everyone settles with him. He is
learning these tools, so explain what each step does and why.

## Rules

- **Read `docs/settlement-rules.md` before touching `lib/settlement.ts`, `lib/money.ts`
  or `db/schema.ts`.** If a rule changes, update the doc in the same change.
- **Money is never a float.** Postgres `numeric(12,2)` comes back from Drizzle as a string.
  Convert with `toCentavos`, do the math in integer centavos, and write back with
  `fromCentavos`. Splits must always sum exactly to the total.
- Split leftover centavos in `splitOrder()` order (the collector first).
- Keep `lib/settlement.ts` pure (no DB access) and covered by tests. The August 2026
  fixture in `lib/__fixtures__/` is the reference data.
- App code imports the DB from `@/db` (server-only). Scripts under `scripts/` run under
  tsx and must use `createDb` from `db/client.ts` instead, because `server-only` throws
  outside Next.
- Schema changes: `npm run db:generate`, review the SQL, then `npm run db:migrate`. Never `push`.
- Every table has RLS enabled with no policies (blocks Supabase's public Data API).
  Keep `.enableRLS()` on new tables.
- **No public deploy until auth exists**: the app shows household finances.
- Pre-PR: `npm run typecheck`, `npm run lint`, `npm test`.
