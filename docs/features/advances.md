# Advances

## Status
✅ Working.

## What it does
- **Advances Log:** every advance and bill paid in the month, grouped by person, with search
  and filters (payer, category, shared column). A column's total on the Split Table opens the
  log filtered to that column (`?column=<id>`, kept in the address bar as the filter changes;
  an id that isn't one of the month's columns is dropped by a redirect).
  Each person's group starts closed; a search or filter opens them all so matches show, and
  they can still be closed (or Expand / Collapse all) until the filters change.
  Bills paid show as read-only "Bills" rows (they're not stored as advances, so
  nothing counts twice). The Helper, once its visits are logged, shows one row per person who
  paid her ([helper.md](helper.md)).
- Log, edit (payer, category, description, amount, date, column) and delete advances;
  "Save & add another" for entering many receipts in a row.
- **Who can log what** ([auth.md](auth.md)): PA logs, edits and deletes any advance. Everyone
  else logs their own into the default column (Advances Shared), and can edit or delete it
  while it's still there — once PA moves it to another column, it's PA's.
- **Advances Report:** per-person totals.
- Each advance goes into a **shared column** — usually Advances Shared (everyone); situational
  columns (e.g. "w/o PA", a Manual adjustment) are added in Manage.

## How it's built
- Route: `app/periods/[year]/[month]/advances/page.tsx` (tab 2).
- UI: `components/advances-log.tsx`, `components/advances-report.tsx`, the dialogs in
  `components/entry-dialogs.tsx` (`useDialogForm`: `onSubmit` + `startTransition`; a toast once
  saved, its `saved` text, as for every dialog: `docs/decisions.md`, 2026-10-18). An empty month
  shows `components/empty-state.tsx`.
- Pure helpers: `lib/advances-log.ts` (split tags, grouping by person, the column filter:
  `columnFilterFrom`, `inColumn`) — tested in `lib/advances-log.test.ts`.
- The column filter is read from the URL (`useSearchParams`) and written back with
  `history.replaceState`; why in [decisions.md](../decisions.md) (2026-10-15).
- Actions: `addAdvance`, `updateAdvance`, `deleteAdvance` in `app/periods/[year]/[month]/actions.ts`
  — open to members (`run("member", …)`), like the Helper's ([helper.md](helper.md)): for a
  member the payer and column are forced, and `canManageAdvance` (`lib/permissions.ts`) is
  checked against the stored advance.
- Tables: `advances`, `shared_columns`, `shared_column_members`.

## Rules
[Shared columns (advances)](../settlement-rules.md#shared-columns-advances) ·
["Never log a bill as an advance"](../settlement-rules.md#the-full-ledger-month-final)

## Open items
Attaching a receipt to an advance ([TODO.md](../TODO.md)).

## Built in
Early commits on `main` (advances log, grouping by person, editing advances, per-person report).
