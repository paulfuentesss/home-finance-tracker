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
  whether they were sent it ("✓ sent Oct. 31", or "not sent" when a send to them failed), and
  who has no email address.
- **View-only logins** (family who only look) get a short, warm "October's bills are in!" note with
  the first bill email, with a link to the month's Split Table and no amounts. A resend doesn't
  repeat it. The bill-email box lists them under "View only" ("✓ told Oct. 31"). It's the only
  email they get.
- **Housemates' banner** (one at a time): "Your October bill is ready: ₱X to pay" with a
  **Pay in Settle Up** button, until it's paid or sent ("waiting for PA to confirm"). Otherwise,
  in the month's last week, "N days left to log your October expenses". On an ended month that
  isn't closed, a note says it's locked and links to the next month.
- The admin sees which month-end reminder went out last, under the bill-email box, so a job
  that stopped working shows.
- **How it works** has a "Your part each month" card (the two jobs and the email timeline) and
  two questions: "What happens when the month ends?" and "What emails will I get?".

**Safety switch:** localhost and the live site share one database, so only the live site
(Vercel production) emails housemates and records what it sent. Anywhere else, every email goes
to `EMAIL_TEST_TO` with "[test → name]" in the subject (or is only logged when that's unset),
and nothing is recorded. A test can't stop a real reminder.

## How it's built
- Rules (pure, tested): `reminderDue`, `daysLeftIn`, `payablesOf`, `housemateNotice`,
  `adminNudge`, `REMINDER_DAYS` in `lib/reminders.ts`; `monthHasEnded`, `monthAfter`, `payablesCheck` in
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
- Daily job: `vercel.json` → `crons` calls `GET /api/reminders` once a day, in the morning
  Manila time (Hobby runs it any time within the scheduled hour). The route
  (`app/api/reminders/route.ts`) checks `CRON_SECRET` first and is public in `proxy.ts`. Off
  the live site, `?today=YYYY-MM-DD` tries a given day.
- No double sends: each reminder is claimed in `reminder_sends` (unique month + kind + member)
  before it's sent, so a second call of the same cron sends nothing. A failed send removes its
  claim, so the next day retries just that person. A bill email rewrites its row's time.
- Action: `emailPayables` (admin) in `app/periods/[year]/[month]/actions.ts`. The lock is
  `loadOpenPeriod(tx, id, viewer)` in the same file, passed the viewer by the six advance and
  Helper actions (the guard test checks it).
- UI: `components/month-notices.tsx` (the banners, in `[month]/layout.tsx`); the bill-email box
  in `components/settle-up.tsx`; reads in `lib/reminder-status.ts` (`getBillNotice`,
  `getEmailStatus`, admin only); `components/advances-log.tsx` and `components/helper-log.tsx`
  hide housemates' controls through `canLogIn`.
- Table: `reminder_sends` (month, kind, member, sent at) — migrations `0014`, `0015` (the
  two nudge kinds) and `0020` (`bills_in`).
- Setup: [operations.md → Emails & reminders](../operations.md#emails--reminders).

## Rules
[What's still owed after a bill email](../settlement-rules.md#whats-still-owed-after-a-bill-email) ·
[Closing and reopening a month](../settlement-rules.md#closing-and-reopening-a-month)

## Open items
[TODO.md](../TODO.md): telling the housemates; more reminders (Ideas).

## Built in
#38 (`feat/install-app`); fixes after review in `test/backup-coverage`.
