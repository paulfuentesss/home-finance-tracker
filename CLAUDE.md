# My House

Household expense tracker replacing a monthly Google Sheet. Next.js 16 App Router,
shadcn/ui, Drizzle ORM on Supabase Postgres, Vitest.

The user (Paul, "PA" in the data) is both the developer and the household's
**collector**: he pays the core bills upfront, and everyone settles up through the **House
Budget**, the savings account he looks after (a payment side, not a member). He is
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
- Something housemates see or do changes, or a feature they'll use lands → check its question
  on `app/how-it-works/page.tsx` (the household's FAQ, grouped) still matches, and add one if it's
  missing. Housemate-facing only: admin-only detail lives in `docs/features/`.
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
  the collector included). Bill shares come only from `computeBillShares`. Everyone's Final plus
  what the House Budget holds sums to ₱0.00 too.
- A payment side is a `Party` (member id or `HOUSE_BUDGET`); the House Budget is stored as NULL.
  Convert only with `partyFromColumn` / `partyToColumn`, and never treat a NULL side as "not a
  payment" (decide from `receipts.payment_id`; `canOpenReceipt`).
- **Money is never a float.** Postgres `numeric(12,2)` comes back from Drizzle as a string.
  Convert with `toCentavos`, do the math in integer centavos, and write back with
  `fromCentavos`. Splits must always sum exactly to the total.
- Split leftover centavos in `splitOrder()` order (the collector first).
- Keep `lib/settlement.ts` pure (no DB access) and covered by tests. The August 2026
  fixture in `lib/__fixtures__/` is **made up** (Ana, Ben, Cara, Dan, PA) and is the reference
  data; work new expected values out by hand from the rules, never copy the app's output.
  Never put the household's real names, amounts or places in fixtures, tests or docs.
  `npm run db:seed:august` loads it into a **local** database only (`lib/local-database.ts`).
- App code imports the DB from `@/db` (server-only). Scripts under `scripts/` run under
  tsx and must use `createDb` from `db/client.ts` instead, because `server-only` throws
  outside Next.
- Schema changes: `npm run db:generate`, review the SQL, then `npm run db:migrate`. Never `push`.
- **Download backup must keep covering everything** (`docs/operations.md` → Backups). Every
  change that stores something new checks it's in the zip and restorable:
  - A new table is backed up on its own, but needs sample rows in `SAMPLE` in
    `lib/backup.test.ts` (the test fails otherwise).
  - A new Storage bucket isn't: add it to `app/backup/route.ts`, `storage:backup` and
    `storage:restore`, then to `BACKED_UP_BUCKETS` in `lib/backup.test.ts` (fails until then).
  - Data that needs something outside the zip to use (a key like `BILLER_SECRET_KEY`, another
    service) → say so in `docs/operations.md` → Backups.
- **One database:** `localhost`, scripts and the live site share it, so local edits, seeds and
  migrations hit live data. A migration must be safe for the code already deployed (add first,
  remove later; backup before anything destructive) — `docs/operations.md` → One database.
- Every table has RLS enabled with no policies (blocks Supabase's public Data API).
  Keep `.enableRLS()` on new tables.
- **Login guards everything** (`docs/features/auth.md`). Server Actions and Route Handlers are
  public endpoints:
  - Every Server Action goes through `run("admin" | "member", …)`; only the three advance
    actions (`canManageAdvance`), the three Helper actions (`canManageHelperEntry`) and a
    housemate's "I paid" — `submitPayment`, `cancelPayment` (`canSubmitPayment`,
    `canCancelPayment`) — and `updateMemberEmoji` (`canSetEmoji`) are `"member"`, and they
    check ownership themselves.
  - Page reads go through `lib/auth.ts` (`requireViewer` in `lib/periods.ts`); a page that
    queries `db` directly checks the viewer itself (see the Manage page).
  - "Preview as a housemate" (`getPreview`) is for drawing pages only: the month layout picks who
    the page is drawn for, and tabs show/hide through the context (`useViewer`, `useCanEdit`);
    the Manage page also uses it to bounce a preview. Access checks always
    use the real viewer (`requireViewer` / `getViewer`), and `run()` refuses changes while a
    preview is on.
  - Permission rules live in `lib/permissions.ts` (pure, tested). Members match on
    `auth_user_id` only — never the email in the token. Never spread member rows into what
    goes to the browser.
  - A new Route Handler does its own auth, joins `PUBLIC_PATHS` in `proxy.ts` if public, and
    the allowlist in `lib/actions-guard.test.ts`.
  - `SUPABASE_SECRET_KEY` is read only in `lib/supabase/admin-server.ts` (and scripts).
  - `BILLER_SECRET_KEY` (encrypts the Billers tab's passwords) is read only in
    `lib/biller-secrets.ts`. Passwords are never sent with a page; Reveal fetches one from
    `/biller-secrets/<id>`. Never `zod.parse` a password (`run()` logs errors, and a zod error carries the input).
  - Two routes have no login, each checking its shared secret (`checkBearerSecret`) before
    anything else, and each the only reader of it: `/api/bill-email` (the Gmail script,
    `BILL_EMAIL_SECRET`) and `/api/reminders` (Vercel's daily cron, `CRON_SECRET`).
  - `/api/seen` (who's using My House) checks the login first and writes only the caller's own
    `member_devices` row — the real viewer, never a preview's housemate (guard-tested).
  - **Emails** go out only through `lib/email.ts` (the only reader of `GMAIL_SMTP_APP_PASSWORD`).
    Only the live site emails housemates and writes `reminder_sends`; localhost redirects every
    email to `EMAIL_TEST_TO` — keep it that way (one database: `docs/features/reminders.md`).
  - **Push notifications** go out only through `lib/push.ts` (the only reader of
    `VAPID_PRIVATE_KEY`), and like email only from the live site, to subscriptions saved there
    (`push_subscriptions.live`); localhost only logs, or with `PUSH_TEST=on` pushes to the admin's
    devices. No amounts or typed text in a push (`lib/push-messages.ts`), and a push never blocks
    an email, a save or the cron: after the email has gone, or in `after()`
    (`docs/features/notifications.md`).
  - Once a month has ended, housemates can't change it: the advance and Helper actions pass the
    viewer to `loadOpenPeriod` (guard-tested); the UI uses `canLogIn`.
  - Storage policies must never grant access to every `authenticated` user.
- **Online on Vercel** (`docs/operations.md` → Hosting): merging to `main` deploys. A new env
  var goes into Vercel too (Production, Sensitive) and needs a redeploy; open items are in
  `docs/TODO.md` → Going online.
- Editable values in tables/lists use `components/inline-input.tsx` (save on Enter/blur,
  Escape reverts, readOnly while saving). Dialog forms submit through `useDialogForm` in
  `components/entry-dialogs.tsx`. Both use `onSubmit` + `startTransition` instead of
  `<form action>`, because React resets a form after every action — even a failed one —
  which wipes what was typed.
- Pre-PR: `npm run typecheck`, `npm run lint`, `npm test` (CI runs the same three on every PR:
  `.github/workflows/checks.yml`). Then the review agents in `.claude/agents/`: **docs-keeper**
  always, **money-reviewer** when money files or the schema changed. They only report; fix what
  they find before committing.
- **Parallel sessions: one task, one worktree, one dev server, one PR.** Paul runs several Claude
  sessions at once, each on a different task. Each works in its own worktree (a folder next to
  the main one, on its own branch from GitHub's `main`) and raises its own PR
  (`docs/commands.md` → Working in parallel). Every session starts with a "Startup check" report
  from `.claude/hooks/checkout-status.sh` (the main folder, every worktree with its site and PR,
  open PRs, finished worktrees and branches):
  - **Start:** before changing anything, `npm run worktree:new -- <name> [<type>/<name>]` (run
    from the main folder; branch defaults to `feat/<name>`), then `EnterWorktree` with the folder
    it prints. Continuing a task listed in the startup check → `EnterWorktree` its folder. Tell
    Paul the folder and branch.
  - **The main folder stays on `main`** and nobody works in it. Changes there are left from the
    old shared-folder way: never stash, reset, discard or reformat them. Once its branch's PR is
    merged and it has no changes, the startup check says to run
    `git switch main && git merge --ff-only origin/main` there.
  - **Seeing it in the browser:** `npm run dev` (in the background) from the worktree serves it on
    the first free port from 3001 and prints the address; the tab reads `[<name>] My House`.
    Give Paul the link. Start or restart only your own worktree's server; `localhost:3000` is the
    main folder's.
  - Change files only with Edit/Write — never through the shell (`sed -i`, `cat >`, a script
    writing files). Edit/Write refuse to save over changes made since your last read; the
    shell doesn't check.
  - Hooks back this up (`.claude/hooks/`): `git-guard.sh` blocks git commands that discard
    changes or switch branches (only `git switch main` is allowed); `edit-overlap.sh` tells you
    (no prompt for Paul) when another session, in any worktree, changed the same file in the last
    hour — your PRs will probably conflict there, so keep to your own part. When `git-guard.sh`
    stops you, tell Paul; don't work around it.
  - **Raising the PR** (only when Paul asks), from the worktree:
    1. `gh pr list --head <branch> --state all`. A merged PR → this branch is done; make a new
       worktree for what's left. An open one → re-check it's still open right before pushing.
    2. One commit with this worktree's changes (on an open PR, a new commit on top). Commit
       first: `git merge` refuses while uncommitted changes touch files `main` changed.
    3. `git fetch origin && git merge origin/main` (merge, never rebase: no force-pushes).
       Resolve conflicts with Edit, keeping both sides' intent; ask Paul when unsure. Conflicts
       in `drizzle/` (two branches with new migrations) → stop and ask Paul; never hand-merge the
       journal.
    4. Pre-PR checks (above) on the merged result; fixes go in another commit.
    5. `git push -u origin HEAD`, then `gh pr create` (summary + test plan) if there's no PR.
    6. `gh pr view --json mergeable,mergeStateStatus` (`UNKNOWN` → GitHub is still checking; ask
       again) and `gh pr checks`. `CONFLICTING` → back to step 3 and push the fix. Tell Paul the
       PR link, its merge state and the checks.
  - **Cleaning up:** when the startup check says "Finished worktrees" or "Merged branches still
    here", run `npm run worktrees:clean` / `npm run branches:clean` yourself (they remove only
    work already merged into `main`, and keep anything in use) and tell Paul what went.
  - One database for everyone: only one schema-changing task at a time. Before
    `npm run db:generate`, merge `origin/main` and look for migrations other worktrees haven't
    merged yet (`ls ../home-finance-tracker-*/drizzle/*.sql`); if there are any, ask Paul.
  - Backups (`db:backup`, `storage:backup`) run from the main folder: they write to `backups/`
    in the folder they run from, and a worktree's goes when it's cleaned up.

## Known pitfalls (hit during development — check here first)

| Symptom | Cause | Fix |
|---|---|---|
| Local site stops responding (`curl localhost:<port>` hangs, process still alive) | `npm run build` / `next start` was run in the same folder while its `npm run dev` was up — they share that folder's `.next/` | Don't build while dev is running; smoke-test through the dev server instead. Restart (that folder's server only): kill the `next dev` PID, `rm .next/dev/lock`, `npm run dev` |
| Every page 500s with `Cannot read properties of undefined (reading 'referencedTable')` after a schema change | A Drizzle instance cached across hot reloads still had the old schema | Fixed in `db/index.ts` (only the postgres connection is cached; Drizzle is rebuilt per reload). If it recurs, restart `npm run dev` |
| `npm run db:migrate` spins then exits 1 with no message | Another session holds a lock on the table (a stale dev/studio connection sat in an open transaction for 38 min) | Stop `npm run dev` and `db:studio`, then retry. Inspect with `pg_stat_activity` / `pg_locks` (script via `DIRECT_URL`). Idle connections now close after 20 s (`db/client.ts`) |
| `drizzle-kit generate` fails: "Interactive prompts require a TTY" | It asks whether a new table/column is a rename of a dropped one | Run it in your own terminal (choose "create"), or pipe Enter through a pty (`script -q /dev/null …`). Always read the SQL before migrating |
| Migration fails adding a NOT NULL column | Existing rows have no value | Hand-edit the generated SQL (backfill, or clear test data) and note why in a comment — see `drizzle/0002_shared-columns.sql` |
| `db:seed:august` / `bills:import` say they "only run against a local database" | `DIRECT_URL` points at the live database, which holds real data | Expected — they load made-up test data, and there's no test database by choice (`docs/decisions.md`). Fix real data in the app; back up first |
| `tsc` errors about `LayoutProps` / `PageProps` | Route types are generated | Use `npm run typecheck` (runs `next typegen` first) |
| A form loses everything typed when the server returns an error | `<form action={…}>` makes React reset the form after the action, even when it returns `{ ok: false }` | Submit via `onSubmit` + `startTransition(() => dispatch(formData))` — see `InlineInput` / `useDialogForm` |
| No skeleton when switching months; the old month stays until the new one is ready | On purpose: there's no `loading.tsx` above `[month]/layout.tsx` (one there would grey out the sidebar too). The arrow or month tapped shows a spinner (`PendingIcon`) | Keep it that way (`docs/decisions.md`). Each tab's own `loading.tsx` (the Split Table's in `(split)/`) shows inside the layout |
| Database errors "(ENOTFOUND) tenant/user postgres.<ref> not found", and `<ref>.supabase.co` doesn't resolve | The free Supabase project paused (happened 2026-10, despite the keep-alive job) | Paul: Supabase dashboard → **Restore project** (a few minutes, no data lost). Then `npm run db:backup` (pg_dump is Homebrew's: `PATH="/opt/homebrew/opt/libpq/bin:$PATH"`) and re-run the keep-alive job (`gh workflow run keep-alive.yml`) |
| `npm run auth:invite` / `storage:setup` / `storage:backup` fails: "Node.js detected but native WebSocket not found" | Node 20 or older; `@supabase/supabase-js` needs Node 22+ (nvm's default is 24 since 2026-10-11, so Claude's shell starts on it — no `source ~/.nvm/nvm.sh && nvm use` needed; check with `node --version`) | `nvm install && nvm use` (`.nvmrc` pins 24), `nvm alias default 24`, then `npm install` |
| Every page is a plain "Login isn't configured" message | `proxy.ts` needs `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Add them to `.env.local` (`docs/setup.md` step 5), restart `npm run dev` |
| Signed in with Google but told "not invited" | The Google address differs from the invited one (dots, a different account), or the member was removed | Invite the exact address Google shows (`docs/features/auth.md`); PA can always fix his own with `npm run auth:invite` |
| Pages hang 20–100 s, then "Something went wrong"; the dev log shows a query that never returns | `DATABASE_URL` points at the transaction pooler (port 6543), which stops answering when two queries are sent back to back | Use the session pooler (port 5432) for `DATABASE_URL`, locally and in Vercel (`docs/decisions.md`, 2026-10-11) |
| One existing tab shows "Page not found" (others fine; a made-up path 404s the same way) | A long-running `next dev` lost the route after files changed under it (branch switch, merge); the code is fine (2026-10-12, Helper tab) | Restart the dev server (kill the `next dev` PID, `rm .next/dev/lock`, `npm run dev`). Telling it apart from a real `notFound()` needs a signed-in request, so ask Paul or compare with a tab that works |
| The app stops offering to install; DevTools → Application → Manifest shows an error or the login page | `/manifest.webmanifest` (or `/sw.js`) got caught by `proxy.ts` — browsers fetch the manifest without cookies, so it gets the `/login` redirect | Keep both in the proxy matcher's skip list, along with the launch screen `/open` (`docs/features/install-app.md`); check with a cookie-less `curl -I localhost:3000/manifest.webmanifest` → 200 (and `/open`) |
| Signing in on a worktree's site (`localhost:3001`…) ends on the live site | That port isn't in Supabase's Redirect URLs, so Supabase falls back to the Site URL | Add `http://localhost:<port>/**` (`docs/setup.md` step 5). Usually not needed: a sign-in on any localhost port carries to the others |
| A save or a month switch spins forever, with no error | Next thinks it's offline (`experimental.useOffline`): it holds saves and navigations until a connection check gets through (`docs/features/offline.md`) | Look for the No connection strip and the Network tab (DevTools "Offline" left on?). Test offline behaviour on `npm run build && npx next start`, not `npm run dev` |
| `CLAUDE.md` shows as modified after `npm run dev` | `next dev` appends the Next.js agent-rules block below | Expected — commit it |

**Fast dev loop:** make the change → `npm run typecheck && npx eslint && npm test` once per chunk (tests run in a few seconds) →
`curl` only confirms the redirect to `/login` (every page needs a login; no dev bypass) → let Paul check the signed-in
pages in the browser. Money/settlement changes: update the expectations in
`lib/settlement.test.ts`, worked out by hand from the rules (the made-up August fixture).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
