# Reminders & bill emails

## Status
✅ Live since 2026-10-13: the daily job is listed in Vercel and its first run sent the admin's
first nudge. What's left (telling the housemates): [TODO.md → Next](../TODO.md#next).

## What it does
Housemates have two jobs each month: log what they paid for the house by the month's last day,
and pay their share once the bill is out. My House reminds them of both by email and with a
banner at the top of the month pages.

- **Month-end reminders**, emailed to every housemate in the month (not the collector) each
  morning they're due — a week before, a few days before and on the last day (the days are
  `REMINDER_DAYS`; the time is the cron in `vercel.json`). A day the job doesn't run is caught
  up the next day, with the right count ("5 days left"), and never sent twice.
- **The month locks for housemates** after its last day: they can't add, edit or delete their
  advances or Helper entries in it. The admin still can until he closes it. "I paid" still
  works. (Rule: [Closing and reopening](../settlement-rules.md#closing-and-reopening-a-month).)
- **The next month starts by itself** on the 1st (the daily job's first run), the same way "Start <month>"
  does, so housemates can keep logging. When it can't (a housemate's "I paid" still waiting, or
  someone who moved out with a balance), the admin gets one email saying why, his banner says
  the same, and it's tried again every morning. Pressing Start in the month picker still works.
- **Ready nudges** for the admin, about the oldest ended month that's still open, once its bills
  are all in (none pending, none at ₱0, numbers that work out): **"Ready to email everyone their
  bill"** until he has, then **"Everyone has paid — ready to close it"** once every housemate is
  settled (counting payments made in later months, and his paying back anyone owed) and
  closing is allowed. A banner with a Settle Up button, and one email each. Advice only: both
  buttons work any time.
- **Email everyone their bill** (the admin, on Settle Up): once the bills are in and checked,
  each housemate gets their own email. It says what they owe (or get back, from the House
  Budget), any carry-over from last month and any "I paid" still waiting, and links to Settle
  Up. Nobody sees anyone else's amount. Anyone settled, or with everything already sent, gets
  nothing. It's blocked while the numbers can't be calculated or a bill is pending. It can be
  sent again ("Last sent …"). The box lists each housemate with what they owe or get back and
  whether they were sent it ("✓ sent Oct. 31", or "not sent" when a send to them failed),
  whether they've **seen** it since ("· seen Nov. 1": they opened a month page after it went out,
  where the bill banner shows; "· not seen yet" until then, and again after a resend), and who
  has no email address. "Seen" isn't email-open tracking: it can't tell whether the email itself
  was opened, only that they've been in My House since.
- **Still unpaid** (the daily job): a housemate with part of their emailed bill still to pay
  gets a reminder a few days after the bill email, then one every few days (the days are
  `UNPAID_REMINDER_DAYS`): what's left, any "I paid" waiting, the same To do and a link to
  Settle Up. It's about the month their banner shows (the latest bill emailed to them), and
  stops once that's paid or all sent with "I paid". Sending the bill again starts the count
  again; emailing the next month's bill moves it on to that month (which carries the rest
  over). Closing the month doesn't stop it: closing doesn't settle anyone. Paused while that
  month's bill email would be blocked (a bill pending, numbers that don't work out). The admin
  gets no copy: the bill-email box shows "· reminded Nov. 3" after the "✓ sent" date.
- **Biller due dates** (the admin's): the admin pays the billers, so My House tells him when a
  bill is coming due. A bill counts while it has a **Due date** (bill emails fill it in) and no
  **Date paid**, has an amount, and isn't the Helper; from any month, closed ones too, since a
  month's bills fall due after it ends. A **"Bills to pay"** banner on every month
  page lists each one due within a week or overdue ("Meralco (October) due in 3 days (Nov. 14)"),
  amber once one is a few days away (the days are `BILL_DUE_DAYS`), with a **Paid today**
  button that sets its Date paid. A pending bill says to confirm it; a Bill inbox email with a
  due date shows too (with a Bill inbox button) unless its column already has a Due date or a
  Date paid. The daily job emails and pushes the admin a month's list 3 days before a bill is
  due, on the day and the day after (once each, a missed day caught up; a bill added after
  that month's last email can miss a step already past, but still gets the later ones). Marking it paid stops
  both. Date paid can be set on a closed month
  ([Closing](../settlement-rules.md#closing-and-reopening-a-month)). **Housemates and view-only
  logins** see a slim grey line (no box) under their own banners, "Coming up: PLDT Wifi Oct. 30 ·
  Water Nov. 2. PA pays these billers, nothing for you to do": bills due today or later only (an
  overdue one stays on the admin's banner), no Bill inbox lines, no buttons, no email or push.
- **View-only logins** (family who only look) get a short, warm "October's bills are in!" note the
  first time the bill email is sent for a month (even if every housemate is settled), with a link
  to the month's Split Table and no amounts. A resend doesn't
  repeat it. The bill-email box lists them under "View only" ("✓ told Oct. 31 · seen Nov. 1").
  It's the only email they get.
- **The tone:** housemates' and view-only emails sound happy, with an emoji in the subject,
  "Hi Ben! 👋" and a thank-you before the sign-off (a "take care" line for view-only). The
  amounts, To do and link lines stay exact. The admin's own emails (the nudges, "couldn't
  start") stay plain.
- **Housemates' banner** (one at a time): "Your October bill is ready: ₱X to pay" with a
  **Pay in Settle Up** button, until it's paid or sent ("waiting for PA to confirm"). Otherwise,
  in the month's last week, "N days left to log your October expenses". On an ended month that
  isn't closed, a note says it's locked and links to the next month.
- The admin sees which month-end reminder went out last, under the bill-email box, so a job
  that stopped working shows.
- **How it works** has a "Your part each month" card (the two jobs and the email timeline, with
  the still-unpaid reminder) and two questions: "What happens when the month ends?" and "What
  emails will I get?".

**Notifications too:** on devices that turned them on, each of these also comes as a short push
(not the view-only note), sent once the email has gone — [notifications.md](notifications.md).

**Safety switch:** localhost and the live site share one database, so only the live site
(Vercel production) emails housemates and records what it sent. Anywhere else, every email goes
to `EMAIL_TEST_TO` with "[test → name]" in the subject (or is only logged when that's unset),
and nothing is recorded. A test can't stop a real reminder.

## How it's built
- Rules (pure, tested): `reminderDue`, `daysLeftIn`, `payablesOf`, `housemateNotice`,
  `adminNudge`, `REMINDER_DAYS`, `unpaidReminderDue`, `UNPAID_REMINDER_DAYS` in `lib/reminders.ts`; `monthHasEnded`, `monthAfter`, `payablesCheck` in
  `lib/month-lock.ts`; `canLogIn` in `lib/permissions.ts`. Email wording (pure, tested):
  `lib/reminder-emails.ts`.
- What's still owed: the rule is in [settlement-rules.md → What's still owed after a bill
  email](../settlement-rules.md#whats-still-owed-after-a-bill-email); `payablesOf` applies it and
  `payablesIn` / `computeForPayables` (`lib/periods.ts`) feed it the month, later payments and
  the latest Finals. It's worked out fresh on every page, so the banner disappears as soon as
  they're settled — a payment confirmed, or later spending of theirs covering it.
- Starting the month: the daily job calls `startNextMonthIn` (`lib/month-start.ts`), the same
  function as the Start button, once the latest month has ended. Off the live site it runs
  with `dryRun` (checks, writes nothing) and answers "would start …". A refusal is emailed
  once (`start_next`); the admin's banner asks `startBlockReason` (the same dry run) each time,
  so it always shows the current reason.
- Nudges: `findAdminNudge` in `lib/reminder-status.ts` looks at the oldest ended month that's
  still open; the month pages show it (`getAdminNudge`), and the daily job emails it once
  (`ready_bill` / `ready_close`).
- Sending: `lib/email.ts` (nodemailer over the household Gmail's SMTP, the safety switch,
  `appLink` from `VERCEL_PROJECT_PRODUCTION_URL`). `lib/reminder-send.ts` has
  `runDailyReminders` and `sendPayables`. `sendPayables` sends the view-only note (`billsInEmail`)
  through the same `sendOnce` claim as the daily job (kind `bills_in`), which is what makes it
  once per month. `sendOnce` returns the error from a failed send, so a missing email setting
  says so instead of "try again".
- Still unpaid: `sendUnpaidReminders` in `lib/reminder-send.ts` starts from `latestBillSends`
  (`lib/reminder-status.ts`, which the banner's `getBillNotice` uses too, so both talk about
  the same month), checks `payablesCheck` and `payablesIn`, then `unpaidReminderDue`; the words
  are `unpaidEmail`.
- Biller due dates: `billsDue`, `billsComingUp`, `comingUpText`, `billDueReminderDue`,
  `dueWhen`, `dueIn` and `BILL_DUE_DAYS` (pure, tested) in `lib/reminders.ts`; `loadBillsDue` /
  `getBillsDue` (the admin's list or `billsComingUp`, for the drawn viewer so a preview shows the
  housemate's) in `lib/reminder-status.ts`; the list and its Paid today button in
  `components/bills-due.tsx`; `markBillPaid` and `updateBillDates` (Date paid through
  `loadBillForDatePaid`, which skips the open-month check) in the month actions;
  `sendBillDueReminders` in `lib/reminder-send.ts` with `billDueEmail` / `billDuePush` (kind
  `bill_due`, one row per month like the unpaid follow-up).
- Daily job: `vercel.json` → `crons` calls `GET /api/reminders` once a day, in the morning
  Manila time (Hobby runs it any time within the scheduled hour). The route
  (`app/api/reminders/route.ts`) checks `CRON_SECRET` first and is public in `proxy.ts`. Off
  the live site, `?today=YYYY-MM-DD` tries a given day.
- Failure alert: after each run the live site pings `HEALTHCHECK_URL` (healthchecks.io) — its
  `/fail` address when an email couldn't be sent or the run threw (`healthPingPath` in
  `lib/health-ping.ts`, tested). The service emails the admin on a failure or a missed day.
  Optional: with it unset nothing is pinged. Setup in operations.md (below).
- No double sends: each reminder is claimed in `reminder_sends` (unique month + kind + member)
  before it's sent, so a second call of the same cron sends nothing. A failed send removes its
  claim, so the next day retries just that person. A bill email rewrites its row's time. The
  still-unpaid follow-up and the bills to pay (`sendAgain`) have one row per month + member whose time moves forward
  each time; a run claims it by moving it from the time it read (to the millisecond), and a
  failed send puts the old time back.
- Seen: `BillSeen` (`components/seen-tracker.tsx`), rendered by `[month]/layout.tsx` for the
  real viewer (never the admin or a preview), posts `{ via, platform, drawnAt }` to
  `/api/seen` once the page is on screen. `drawnAt` is when the server drew that page, so a bill
  emailed while an old page was open, a prefetch, or a tab coming back into view doesn't count.
  The route sets `seen_at` on the caller's own `payables` / `bills_in` rows sent before
  `drawnAt` and not yet seen since their send (`lib/seen-route.test.ts`). `getEmailStatus` shows
  it only while it's after `sent_at` (`seenAfter` in `lib/reminders.ts`), so a resend needs a new
  look. Rows sent before this existed were filled in from `member_devices` (migration `0023`).
- Action: `emailPayables` (admin) in `app/periods/[year]/[month]/actions.ts`. The lock is
  `loadOpenPeriod(tx, id, viewer)` in the same file, passed the viewer by the six advance and
  Helper actions (the guard test checks it).
- UI: `components/month-notices.tsx` (the banners, in `[month]/layout.tsx`); the bill-email box
  in `components/settle-up.tsx`; reads in `lib/reminder-status.ts` (`getBillNotice`,
  `getEmailStatus`, admin only); `components/advances-log.tsx` and `components/helper-log.tsx`
  hide housemates' controls through `canLogIn`.
- Table: `reminder_sends` (month, kind, member, sent at, seen at) — migrations `0014`, `0015`
  (the two nudge kinds), `0020` (`bills_in`), `0021` (`unpaid`), `0023` (`seen_at`) and `0025`
  (`bill_due`).
- Setup: [operations.md → Emails & reminders](../operations.md#emails--reminders).

## Rules
[What's still owed after a bill email](../settlement-rules.md#whats-still-owed-after-a-bill-email) ·
[Closing and reopening a month](../settlement-rules.md#closing-and-reopening-a-month)

## Open items
[TODO.md](../TODO.md): telling the housemates; setting up the failure alert; filling Date paid
from payment-confirmation emails (Ideas).

## Built in
#38 (`feat/install-app`); fixes after review in `test/backup-coverage`.
