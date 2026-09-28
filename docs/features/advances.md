# Advances

## Status
✅ Working.

## What it does
- **Advances Log:** every advance and bill paid in the month, grouped by person, with search
  and filters. Bills paid show as read-only "Direct Bill Pay" rows (they're not stored as
  advances, so nothing counts twice).
- Log, edit (payer, category, description, amount, date, column) and delete advances;
  "Save & add another" for entering many receipts in a row.
- **Advances Report:** per-person totals.
- Each advance goes into a **shared column** — usually Advances Shared (everyone); situational
  columns (e.g. "w/o PA", a Manual adjustment) are added in Manage.

## How it's built
- Route: `app/periods/[year]/[month]/advances/page.tsx` (tab 2).
- UI: `components/advances-log.tsx`, `components/advances-report.tsx`, the dialogs in
  `components/entry-dialogs.tsx` (`useDialogForm`: `onSubmit` + `startTransition`).
- Pure helpers: `lib/advances-log.ts` (split tags, grouping by person) — tested in
  `lib/advances-log.test.ts`.
- Actions: `addAdvance`, `updateAdvance`, `deleteAdvance` in `app/periods/[year]/[month]/actions.ts`.
- Tables: `advances`, `shared_columns`, `shared_column_members`.

## Rules
[Shared columns (advances)](../settlement-rules.md#shared-columns-advances) ·
["Never log a bill as an advance"](../settlement-rules.md#the-full-ledger-month-final)

## Open items
Attaching a receipt to an advance: [receipts.md](receipts.md).

## Built in
Early commits on `main` (advances log, grouping by person, editing advances, per-person report).
