# Months

## Status
✅ Working.

## What it does
- **Month picker** at the top of the sidebar (on phones and tablets, centred in the top bar
  between ☰ and the house, with the short name, "SEP 2026"); the home page opens the most recent month. Switching keeps
  the section you're on.
- **Back to <newest month>:** on an older month, a small link under the month picker (sidebar,
  ☰ menu and the phone's top bar) opens the same section of the newest month. Hidden on the
  newest month itself, so the top bar keeps its height there.
- **Sidebar:** every month page and How it works (on the latest month) has a dark sidebar with the month, the sections (This month:
  Split Table, Advances, Helper Visits, Receipts, Settle Up; Household: Billers & Accounts,
  Manage), How it works, and the account menu (with the person's emoji). The house icon
  (in the sidebar and the phone's top bar; the "My House" name beside it is plain text) goes home: the newest month's Split Table, from any
  month or page. Below desktop width it slides in from ☰ or a
  swipe right from near the left edge (start a finger-width in: on Android the very edge is the
  phone's Back gesture), and closes on any link, Escape, a tap outside, or dragging it back left.
  Swipes that scroll a wide table back, select text in a box, or start in a dialog don't open
  it. The page header shows the section's name and the month's two totals.
- **Starting the next month** happens by itself the morning after the latest month ends
  ([reminders.md](reminders.md)); **Start <next month>** (on the latest month) does it now. Either way it creates the next month with everyone currently
  active (view-only logins aside), copies the bill columns (split, points, payer, which one is the Helper's) at ₱0.00 and an empty Advances Shared.
  Refuses to leave out someone who moved out with an unsettled Final, and waits while a
  housemate's "I paid" is still waiting ([settle-up.md](settle-up.md)).
- **Live carry-over:** an open month's Prev Month Unsettled is the previous month's Final,
  computed on the fly.
- **Ending:** after its last day (Manila) a month is locked for housemates. Their add / edit /
  delete buttons for advances and Helper entries disappear, a note links to the next month,
  and the server refuses the change. The admin can still change it until closing. Reminders
  before the end and the admin's "start the next month" are in [reminders.md](reminders.md).
- **Closing** locks a month and saves everyone's Final as the next month's opening balance;
  unpaid amounts carry over. Months close oldest-first and reopen newest-first. Closing is
  blocked while the numbers can't be calculated, a bill is still pending, a housemate's payment
  is still waiting, or someone with a balance isn't in the next month.
- **Backup reminder** (the admin only, not while previewing): a banner on the month pages
  after a month is started or closed, until a Download backup finishes, on any device. Without
  any backup yet, it asks for a first one.
- **Loading and switching:** a tab shows a grey placeholder shaped like that tab while it
  loads, then its cards fade up one after another (opacity only with reduced motion). Switching
  months keeps the current month on screen, with a spinner on the arrow or month tapped, until
  the new month is ready; the month list stays open until then.
- **Phones:** inputs use 16px text on phones, so iPhone doesn't zoom in when one is tapped, and
  buttons are bigger on touch screens (`pointer-coarse:` sizes in `components/ui/button.tsx`).

## How it's built
- Routes: `app/page.tsx` (redirects to the latest month). Each tab has its own `loading.tsx`
  next to its `page.tsx`; the Split Table's sits in the `(split)` route group (not in the URL)
  for that. There's no `loading.tsx` above the month layout on purpose, so a month switch keeps
  the page instead of greying out the sidebar ([decisions](../decisions.md)).
- Fade-in: `components/page-enter.tsx` around each page's content, `.page-enter` in
  `app/globals.css`. The month spinner: `PendingIcon` (`useLinkStatus`) in `components/period-nav.tsx`.
- UI: `components/period-nav.tsx` (sections, month picker, Start next month),
  `components/app-sidebar.tsx` (the sidebar and the phone menu, on `components/ui/sheet.tsx`,
  Base UI's `Drawer`; the swipe to open is `useEdgeSwipe` there, decided by `lib/edge-swipe.ts`),
  `components/period-header.tsx` (section name, totals),
  close / reopen in `components/settle-up.tsx`, `components/page-skeleton.tsx`.
- Carry-over: `computePeriod` in `lib/periods.ts` walks every month up to the one shown.
- Lock rules: `closeCheck`, `startCheck`, `reopenCheck`, `vanishingBalances`, `monthHasEnded` in
  `lib/month-lock.ts` (pure, tested in `lib/month-lock.test.ts`). An ended month: `ended` on
  `PeriodView` (`lib/periods.ts`), `canLogIn` in `lib/permissions.ts` for the buttons,
  `loadOpenPeriod(tx, id, viewer)` in the actions for the server.
- Actions: `startNextMonth`, `closeMonth`, `reopenMonth` in `app/periods/[year]/[month]/actions.ts`.
  Starting itself is `startNextMonthIn` in `lib/month-start.ts`, shared with the daily job.
- Backup reminder: `backupReminder` in `lib/backup-reminder.ts` (pure, tested) compares every
  month's `created_at` / `closed_at` with the latest row in `backups` (read in
  `lib/backup-status.ts`, admin only); the banner is `components/backup-reminder.tsx`, shown by
  `[month]/layout.tsx`. `/backup` adds the `backups` row once the zip has fully streamed.
- Tables: `billing_periods` (status, closed at), `period_balances` (who's in the month,
  opening and closing balances), `backups` (the reminder).

## Rules
[Months and carry-over](../settlement-rules.md#months-and-carry-over) ·
[Closing and reopening a month](../settlement-rules.md#closing-and-reopening-a-month)

## Open items
None.

## Built in
Early commits on `main` (month picker, Start next month, loading states); #1 (closing /
reopening); #2 (pending bills block closing); #29 (waiting payments block closing and starting); the logo going home in `feat/member-photos`.
