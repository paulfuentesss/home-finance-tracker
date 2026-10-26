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
  Bills paid show as read-only rows in the Bills category (they're not stored as advances, so
  nothing counts twice); their Column cell reads "Own column" in plain text, since each bill is
  split in its own column on the Split Table. The bills filter is the Category one.
  The Helper, once its visits are logged, shows one row per person who paid her
  ([helper.md](helper.md)).
- Log, edit (payer, category, description, amount, date, column) and delete advances;
  "Save & add another" for entering many receipts in a row.
- **Paid from the cash drawer** (PA only): a checkbox on an advance he paid himself. It puts the
  advance in his [Cash Drawer](cash-drawer.md) and marks it with a Drawer pill in the log. It
  changes nothing in the split.
- **Who can log what** ([auth.md](auth.md)): PA logs, edits and deletes any advance. Everyone
  else logs their own into the default column (Advances Shared), and can edit or delete it
  while it's still there — once PA moves it to another column, it's PA's.
- **Advances Report** (`components/advances-report.tsx`): the log added up two ways, both
  totals equal to the log's total with no filters (bills paid count as advances, as in Own Adv):
  - *Advances by Category:* Bills (confirmed bills, the header's Total core bills), then each
    advance category (together the header's Shared advances), and their Total.
  - *Out-of-Pocket by Person:* each person's advances plus bills paid (Own Adv in the Split
    Table; greyed at ₱0), and their Total — the same as each person's group total in the log.
  When the month's numbers can't be computed (no settlement rows), the per-person amounts and
  their Total show "—" rather than ₱0.
- Each person's group header in the log shows their total (of the rows shown, so with no
  filters it's their Out-of-Pocket by Person), and the log's total is labelled "Total".
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
