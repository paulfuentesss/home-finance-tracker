# My House

Household expense tracker replacing a monthly Google Sheet. Next.js 16 App Router,
shadcn/ui, Drizzle ORM on Supabase Postgres, Vitest.

The user (Paul, "PA" in the data) is both the developer and the household's
**collector**: he pays the core bills upfront and everyone settles with him. He is
learning these tools, so explain what each step does and why.

GitHub: `paulfuentesss/home-finance-tracker` (**public**). Local folder:
`~/Documents/GitHub/home-finance-tracker`. Internal names (repo, folder, `package.json`,
backup files) are `home-finance-tracker`; what the household sees is **"My House"** — use that
spelling in every user-facing string (header, tab title, pages) and in the docs.

## Docs map

README.md is the short front page for people; this file is the index for Claude.

| Question | Where |
|---|---|
| What works, what's partly built, how each feature is built | `docs/features/README.md` (the only status list) → one page per feature |
| What's not done yet; the going-online checklist | `docs/TODO.md` |
| How the money is split (the math's source of truth) | `docs/settlement-rules.md` |
| Why something is the way it is | `docs/decisions.md` |
| Tables and migrations | `docs/data-model.md` |
| Tests, fixtures, resetting test data | `docs/testing.md` |
| Setup, commands, operations (backups, keep-alive, services, privacy) | `docs/setup.md`, `docs/commands.md`, `docs/operations.md` |
| Household specifics (git-ignored, never committed) | `.private/NOTES.md` |

## Keeping docs up to date

Part of every change, in the same PR — not a separate chore.

- **One home per topic.** Other docs link to it and never copy it: status only in the
  features index, open items only in `TODO.md`, money rules only in `settlement-rules.md`,
  config values only in code (docs name the setting, e.g. `BILL_PAYMENT_FEES`, not "₱15").
- A feature lands or changes → its `docs/features/*.md` page and its row in the index.
  A feature gets a page when work on it starts; until then it's a `TODO.md` line.
- Something finished, deferred or newly noticed → `docs/TODO.md` (remove finished items; the
  PR is the record).
- A choice with a "why", including decisions from an approved plan (plans are saved outside
  the repo, in `~/.claude/plans`) → `docs/decisions.md`.
- A money rule changes → `docs/settlement-rules.md` **and** `app/how-it-works/page.tsx`.
- New table or migration → `docs/data-model.md`. New command → `docs/commands.md`.
- **The repo is public:** no amounts, account numbers, card or payment details, phone numbers
  or credentials in code, docs or commits. Scrub email fixtures. Household specifics go in
  `.private/NOTES.md`.
- Keep the `BEGIN/END:nextjs-agent-rules` block at the end of this file (`next dev` re-adds it).

## Rules

- **Read `docs/settlement-rules.md` before touching `lib/settlement.ts`, `lib/money.ts`
  or `db/schema.ts`.** If a rule changes, update the doc **and** the household-facing
  "How it works" page (`app/how-it-works/page.tsx`) in the same change.
- Full ledger: everyone's Month Final sums to ₱0.00 (bills paid count as the payer's advance,
  the collector included). Bill shares come only from `computeBillShares`.
- **Money is never a float.** Postgres `numeric(12,2)` comes back from Drizzle as a string.
  Convert with `toCentavos`, do the math in integer centavos, and write back with
  `fromCentavos`. Splits must always sum exactly to the total.
- Split leftover centavos in `splitOrder()` order (the collector first).
- Keep `lib/settlement.ts` pure (no DB access) and covered by tests. The August 2026
  fixture in `lib/__fixtures__/` mirrors the household sheet and is the reference data
  (`npm run db:seed:august -- --replace` resets it in the database).
- App code imports the DB from `@/db` (server-only). Scripts under `scripts/` run under
  tsx and must use `createDb` from `db/client.ts` instead, because `server-only` throws
  outside Next.
- Schema changes: `npm run db:generate`, review the SQL, then `npm run db:migrate`. Never `push`.
- Every table has RLS enabled with no policies (blocks Supabase's public Data API).
  Keep `.enableRLS()` on new tables.
- **Login guards everything** (`docs/features/auth.md`). Server Actions and Route Handlers are
  public endpoints:
  - Every Server Action goes through `run("admin" | "member", …)`; only the three advance
    actions are `"member"`, and they check ownership with `canManageAdvance`.
  - Page reads go through `lib/auth.ts` (`requireViewer` in `lib/periods.ts`); a page that
    queries `db` directly checks the viewer itself (see the Manage page).
  - Permission rules live in `lib/permissions.ts` (pure, tested). Members match on
    `auth_user_id` only — never the email in the token. Never spread member rows into what
    goes to the browser.
  - A new Route Handler does its own auth, joins `PUBLIC_PATHS` in `proxy.ts` if public, and
    the allowlist in `lib/actions-guard.test.ts`.
  - `SUPABASE_SECRET_KEY` is read only in `lib/supabase/admin-server.ts` (and scripts).
  - Storage policies must never grant access to every `authenticated` user.
- **Going online** follows `docs/TODO.md` → Before going online (production URL in Supabase's
  Site URL and Redirect URLs, env vars on the host).
- Editable values in tables/lists use `components/inline-input.tsx` (save on Enter/blur,
  Escape reverts, readOnly while saving). Dialog forms submit through `useDialogForm` in
  `components/entry-dialogs.tsx`. Both use `onSubmit` + `startTransition` instead of
  `<form action>`, because React resets a form after every action — even a failed one —
  which wipes what was typed.
- Pre-PR: `npm run typecheck`, `npm run lint`, `npm test` (CI runs the same three on every PR:
  `.github/workflows/checks.yml`). Then the review agents in `.claude/agents/`: **docs-keeper**
  always, **money-reviewer** when money files or the schema changed. They only report; fix what
  they find before committing.
- **Parallel sessions.** Paul often runs several Claude sessions at once; one folder can only be
  on one branch, so each session needs its own git worktree (`docs/commands.md` → Working in
  parallel). Every session starts with a "Startup check" report from
  `.claude/hooks/checkout-status.sh` (branch, uncommitted changes, worktrees, open PRs):
  - Folder not on `main`, or has changes you didn't make → another session may be using it.
    Don't switch branches, stash, reset or commit its files here; tell Paul and offer a new
    worktree.
  - Right before committing, `git status -sb` again; commit only your own files, on your branch.
  - All worktrees share one database: only one schema-changing feature at a time.

## Known pitfalls (hit during development — check here first)

| Symptom | Cause | Fix |
|---|---|---|
| Local site stops responding (`curl localhost:3000` hangs, process still alive) | `npm run build` / `next start` was run while `npm run dev` was up — they share `.next/` | Don't build while dev is running; smoke-test through the dev server instead. Restart: kill the `next dev` PID, `rm .next/dev/lock`, `npm run dev` |
| Every page 500s with `Cannot read properties of undefined (reading 'referencedTable')` after a schema change | A Drizzle instance cached across hot reloads still had the old schema | Fixed in `db/index.ts` (only the postgres connection is cached; Drizzle is rebuilt per reload). If it recurs, restart `npm run dev` |
| `npm run db:migrate` spins then exits 1 with no message | Another session holds a lock on the table (a stale dev/studio connection sat in an open transaction for 38 min) | Stop `npm run dev` and `db:studio`, then retry. Inspect with `pg_stat_activity` / `pg_locks` (script via `DIRECT_URL`). Idle connections now close after 20 s (`db/client.ts`) |
| `drizzle-kit generate` fails: "Interactive prompts require a TTY" | It asks whether a new table/column is a rename of a dropped one | Run it in your own terminal (choose "create"), or pipe Enter through a pty (`script -q /dev/null …`). Always read the SQL before migrating |
| Migration fails adding a NOT NULL column | Existing rows have no value | Hand-edit the generated SQL (backfill, or clear test data) and note why in a comment — see `drizzle/0002_shared-columns.sql` |
| August numbers look wrong / points reset | Test data was edited while experimenting | `npm run db:seed:august -- --replace` resets only 2026-08 |
| `tsc` errors about `LayoutProps` / `PageProps` | Route types are generated | Use `npm run typecheck` (runs `next typegen` first) |
| A form loses everything typed when the server returns an error | `<form action={…}>` makes React reset the form after the action, even when it returns `{ ok: false }` | Submit via `onSubmit` + `startTransition(() => dispatch(formData))` — see `InlineInput` / `useDialogForm` |
| A `loading.tsx` doesn't show when switching months | `loading.tsx` doesn't cover the `layout.tsx` in its own folder, and `[month]/layout.tsx` loads the data | Month switches use `app/periods/loading.tsx`; tab switches use `[month]/loading.tsx` |
| Database errors "(ENOTFOUND) tenant/user postgres.<ref> not found", and `<ref>.supabase.co` doesn't resolve | The free Supabase project paused (happened 2026-10, despite the keep-alive job) | Paul: Supabase dashboard → **Restore project** (a few minutes, no data lost). Then `npm run db:backup` (pg_dump is Homebrew's: `PATH="/opt/homebrew/opt/libpq/bin:$PATH"`) and re-run the keep-alive job (`gh workflow run keep-alive.yml`) |
| `npm run auth:invite` fails: "Node.js detected but native WebSocket not found" | Node 20 or older; `@supabase/supabase-js` needs Node 22+ | `nvm install && nvm use` (`.nvmrc` pins 24), `nvm alias default 24`, then `npm install` |
| Every page is a plain "Login isn't configured" message | `proxy.ts` needs `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Add them to `.env.local` (`docs/setup.md` step 5), restart `npm run dev` |
| Signed in with Google but told "not invited" | The Google address differs from the invited one (dots, a different account), or the member was removed | Invite the exact address Google shows (`docs/features/auth.md`); PA can always fix his own with `npm run auth:invite` |
| `CLAUDE.md` shows as modified after `npm run dev` | `next dev` appends the Next.js agent-rules block below | Expected — commit it |

**Fast dev loop:** make the change → `npm run typecheck && npx eslint && npm test` once per chunk (tests run in < 1 s) →
`curl` only confirms the redirect to `/login` (every page needs a login; no dev bypass) → let Paul check the signed-in
pages in the browser. Money/settlement changes: update
`lib/__fixtures__/august-2026.ts` expectations, which mirror the household sheet.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
