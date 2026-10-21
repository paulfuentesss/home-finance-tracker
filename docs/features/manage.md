# Manage Columns & People

## Status
✅ Working.

## What it does
- **Bill columns:** add (Auto equal or Manual, fixed once added), rename, delete. Meralco is
  always split by points.
- **Shared columns:** add, rename, delete (only when empty), switch Auto equal ↔ Manual, choose
  who shares an Auto equal column. Its **Shared by** ticks sit on one line when they fit and
  one per line when they don't (no half-wrapped row).
- **Meralco points:** each member's points for the month.
- **Housemates:** add (joins every open month) and remove (deactivated, never deleted; stays in
  months where they have records or an unsettled balance). Removing someone also takes their
  login away.
- **View only:** a box in Add member. A view-only person joins no month and shares in nothing.
  They can sign in and see what a housemate sees, but change nothing ([auth.md](auth.md)).
  They're listed with a grey dot and a "view only" badge. Their role is set when they're added
  (remove and re-add to change it). A former housemate can't be re-added as view only
  ([settlement-rules.md → Adding](../settlement-rules.md)).
- **On a phone** each row of the housemates list (the House Budget's too) starts closed, showing
  the name, its badges and Remove; tapping the name opens the login email, emoji and last seen.
  On a wide screen every row is open. The other cards on the tab don't fold.
- **Emoji:** each person can have an emoji, shown in place of their colour dot everywhere a name
  appears (Split Table, Who owes what, Advances, Settle Up, Receipts, the account menu, How it
  works). Type or paste one into the **Emoji** field under their name (Enter or click away
  saves); empty brings the dot back. One emoji only: skin tones, families and flags count as
  one; text is refused. Housemates can also set their own from the account menu ("Your emoji",
  [auth.md](auth.md)). The **House Budget** row at the end of the list takes one the same way,
  shown in place of its bank icon (Split Table, Settle Up, Receipts); empty brings the icon back.
  Only the admin can change it.
- **Login email** per housemate ([auth.md](auth.md)): typing one invites them (Google or an
  emailed code); clearing it takes the login away. PA's own is changed with
  `npm run auth:invite`. Inviting sends no email, so an address whose domain can't receive mail
  (a typo after the @) is refused (`lib/email-domain.ts`).
- **Who's using it:** each housemate with a login shows **Last seen** ("3 h ago · App on
  iPhone", plus their other devices) or "Not seen yet", and an **app installed** badge once
  they've opened the installed app ([install-app.md](install-app.md)), and **🔔 notifications on**
  when at least one of their devices gets pushes from the live site
  ([notifications.md](notifications.md); hover for how many). Limits: "app installed"
  means *opened* at least once — installing without opening, or uninstalling, can't be seen;
  the device type is coarse (iPhone, iPad, Android, Mac, Windows, other); it all counts from when
  this was added. Housemates aren't told on screen (PA's choice, [decisions.md](../decisions.md)).
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
  All `run("admin", …)`, except `updateMemberEmoji`.
- Emoji: `members.emoji`. `updateMemberEmoji` is a `run("member", …)` action: `canSetEmoji`
  (`lib/permissions.ts`, tested) lets the admin set anyone's and a housemate only their own,
  checked against the real login. `parseEmoji` (`lib/members.ts`, tested) takes exactly one
  grapheme that is an emoji (or empty to clear), at most `MAX_EMOJI_LENGTH` UTF-16 units; the
  `members_emoji_length` check backs it up. Both fields use `components/inline-input.tsx`.
  `components/member-mark.tsx` draws the emoji or the dot, always in the same square so rows line
  up.
- House Budget emoji: `household_settings.house_budget_emoji` (one row, made the first time it's
  set; missing reads as no emoji). `updateHouseBudgetEmoji` is `run("admin", …)`, reuses
  `parseEmoji`, and upserts the row; the `household_settings_house_budget_emoji_length` check backs
  it up. `getPeriodView` reads it into `view.houseBudgetEmoji`; `HouseBudgetMark`
  (`components/member-mark.tsx`) draws it, or the `Landmark` icon, in the same square.
- Shares are written only through `computeBillShares` (`lib/settlement.ts`) and `writeShares`
  (`lib/bill-shares.ts`).
- Household facts that aren't data (what the points are based on): `lib/household-config.ts`.
- Backup: `components/backup-card.tsx` links to `app/backup/route.ts` (admin only; checks the
  viewer itself, `lib/actions-guard.test.ts`). It reads every table in one REPEATABLE READ
  snapshot (`buildBackupSql` in `lib/backup.ts`), lists the bucket (`listReceiptFiles` in
  `lib/receipt-files.ts`), then streams the zip (`backupZipStream`, `fflate`). Tested by restoring
  into PGlite (`lib/backup.test.ts`).
- Who's using it: `components/seen-tracker.tsx` (in `AppShell`, so on every signed-in page) posts
  `{ via, platform }` to `app/api/seen/route.ts` when a page opens or comes back into view, at most
  every 5 minutes. Only the browser can tell the installed app from a tab (`display-mode:
  standalone`) and an iPad from a Mac (touch), so it reports both (`lib/devices.ts`, tested). The
  route checks the real login first (never a preview's housemate; view-only logins count), writes
  only the caller's row, and updates `last_seen_at` only if it's over 5 minutes old. The Manage
  page summarizes the rows (`summarizeDevices`, `seenLabel`, Manila time) and sends only text.
  The same route marks bill emails seen, for the bill-email box on Settle Up
  ([reminders.md](reminders.md), "Seen").
- Tables: `members`, `bill_items`, `bill_item_shares`, `shared_columns`,
  `shared_column_members`, `period_balances`, `member_devices`, `household_settings`.

## Rules
[Members and the collector](../settlement-rules.md#members-and-the-collector) ·
[Meralco point system](../settlement-rules.md#meralco-point-system) ·
[Shared columns](../settlement-rules.md#shared-columns-advances) ·
[Adding and removing members](../settlement-rules.md#adding-and-removing-members)

## Open items
None right now.

## Built in
Early commits on `main` (fixed bill splits, shared columns, member removal fixes); who's using
it in `feat/install-app`; emoji in `feat/member-photos`.
