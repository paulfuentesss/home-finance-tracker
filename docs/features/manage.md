# Manage Columns & People

## Status
✅ Working.

## What it does
- **Bill columns:** add (Auto equal or Manual, fixed once added), rename, delete. Meralco is
  always split by points.
- **Shared columns:** add, rename, delete (only when empty), switch Auto equal ↔ Manual, choose
  who shares an Auto equal column.
- **Meralco points:** each member's points for the month.
- **Housemates:** add (joins every open month) and remove (deactivated, never deleted; stays in
  months where they have records or an unsettled balance). Removing someone also takes their
  login away.
- **Login email** per housemate ([auth.md](auth.md)): typing one invites them (Google or an
  emailed code); clearing it takes the login away. PA's own is changed with
  `npm run auth:invite`. Inviting sends no email, so an address whose domain can't receive mail
  (a typo after the @) is refused (`lib/email-domain.ts`).
- The whole tab is PA's: anyone else is sent back to the month.
- **Bill Inbox** card ([email-bills.md](email-bills.md)).
- **Backup** card: **Download backup** saves a zip of every row (a `.sql` file) and every receipt
  picture, and shows when the last one was downloaded. A reminder banner asks for one after a
  month is started or closed ([months.md](months.md)). How to restore:
  [operations.md → Backups](../operations.md#backups).

## How it's built
- Route: `app/periods/[year]/[month]/manage/page.tsx` (tab 4).
- UI: `components/manage-bills.tsx`, `components/manage-shared-columns.tsx`,
  `components/meralco-points.tsx`, `components/manage-members.tsx`, dialogs in
  `components/entry-dialogs.tsx`.
- Actions (`app/periods/[year]/[month]/actions.ts`): `addBill`, `renameBill`, `deleteBill`,
  `updateBillPoints`, `addSharedColumn`, `setSharedColumnMode`, `updateSharedColumnMembers`,
  `renameSharedColumn`, `deleteSharedColumn`, `addMember`, `removeMember` (with
  `resplitPeriodBills` and `hasRecordsIn`), `updateMemberEmail` (through `lib/invites.ts`).
  All `run("admin", …)`.
- Shares are written only through `computeBillShares` (`lib/settlement.ts`) and `writeShares`
  (`lib/bill-shares.ts`).
- Household facts that aren't data (what the points are based on): `lib/household-config.ts`.
- Backup: `components/backup-card.tsx` links to `app/backup/route.ts` (admin only; checks the
  viewer itself, `lib/actions-guard.test.ts`). It reads every table in one REPEATABLE READ
  snapshot (`buildBackupSql` in `lib/backup.ts`), lists the bucket (`listReceiptFiles` in
  `lib/receipt-files.ts`), then streams the zip (`backupZipStream`, `fflate`). Tested by restoring
  into PGlite (`lib/backup.test.ts`).
- Tables: `members`, `bill_items`, `bill_item_shares`, `shared_columns`,
  `shared_column_members`, `period_balances`.

## Rules
[Members and the collector](../settlement-rules.md#members-and-the-collector) ·
[Meralco point system](../settlement-rules.md#meralco-point-system) ·
[Shared columns](../settlement-rules.md#shared-columns-advances) ·
[Adding and removing members](../settlement-rules.md#adding-and-removing-members)

## Open items
A picture (GIF) for each member ([TODO.md](../TODO.md)).

## Built in
Early commits on `main` (fixed bill splits, shared columns, member removal fixes).
