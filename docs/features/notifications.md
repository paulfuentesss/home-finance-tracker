# Notifications (push)

## Status
✅ Working: live since 2026-10-18 (its keys in Vercel), checked on a real Android phone and
iPhone.

## What it does
A short notification on the phone (or computer) when something is due soon, opening the right
page when tapped. **Alongside email, never instead:** the emails still all go out and stay the
full record; a push is a heads-up. Each person turns it on per device.

**Only when something is due soon**, so phones don't buzz twice for everything:

| Moment | Email | Push |
|---|---|---|
| Month-end, a week before / a few days before | ✅ | — (too early to need a buzz) |
| Month-end, **the last day** | ✅ | ✅ |
| **Your bill is ready** (or you get money back) | ✅ | ✅ |
| **Still unpaid** follow-up | ✅ | ✅ |
| **Your "I paid" confirmed / rejected** | — | ✅ |
| View-only "the bills are in" | ✅ | — |
| Admin: **a housemate tapped "I paid"** | — | ✅ |
| Admin: **a bill email came in** (to confirm) or couldn't be added (Bill inbox) | — | ✅ |
| Admin: ready to email the bill / ready to close / couldn't start the month | ✅ | ✅ |

That's about 3–4 a month for a housemate who pays on time.

- **No amounts, ever** — a notification shows on the lock screen, where anyone near the phone can
  read it. "Your October bill is ready — tap to see your share". A rejection doesn't show the
  reason either (it's free text the admin wrote); tapping shows it in Settle Up.
- A newer push about the same thing replaces the older one (the still-unpaid reminder replaces the
  bill one), so they don't pile up — and still alerts (`renotify` in `public/sw.js`; without it
  Chrome swaps it in silently, no banner).
- **Turning it on:** account menu → **Turn on notifications** (on this device), or the one-time
  **Get notified on this phone** card inside the installed app (**Not now** hides it for good on
  that phone; the menu still has it). The browser then asks permission. **Turn off
  notifications** in the same menu.
  - **iPhone/iPad:** only the home-screen app can get them (iOS 16.4 or newer). In a Safari tab the
    menu says to add My House to the Home Screen first.
  - **Blocked** (permission refused once): only the phone's or browser's settings can undo that;
    the menu says so.
  - View-only logins get no pushes, so they don't see either.
- **Signing out** turns them off on that device first, so the next person signed in there doesn't
  get the previous one's.
- **Manage → People:** "🔔 notifications on" next to anyone with them on (hover: how many devices).
- A housemate with no email address gets neither (pushes follow the emails, as below).

## How it's built
- **How push works:** turning it on gives the browser's *subscription* — the push service's
  address for that device (Google's, Apple's, Mozilla's or Microsoft's) and the keys that encrypt
  what's sent there. `lib/push.ts` signs each push with the VAPID private key (the `web-push`
  library), posts it to that address, and the service delivers it, end-to-end encrypted.
  `public/sw.js` (the service worker) shows it and opens its link when tapped. Free, and no third
  party holds the list.
- **Turning on/off:** `components/notifications.tsx` — `NotificationsMenuItem` (in
  `components/account-menu.tsx`), `NotificationsCard` (in the app shell,
  `components/app-sidebar.tsx`; only inside the installed app, where the install card never
  shows), and `forgetThisDevice` (the sign-out form calls it first, at most ~2 s, then signs out
  whatever happens). Permission is only ever asked from a tap (iPhones require it). Each time the
  app opens with notifications on, the card re-saves this device's subscription, so one the
  browser renewed (or one removed after a failed send) comes back by itself.
- **Saving:** `POST` / `DELETE /api/push` (`app/api/push/route.ts`) — the signed-in member's own
  device only (the real login, never a preview's housemate; guard-tested). `lib/push-subscription.ts`
  (pure, tested) accepts only the four push services' addresses, so a made-up subscription can't
  make the server send requests elsewhere. Posting again from the same device just updates it (a
  phone someone else now signs in on moves to them).
- **Sending:** `lib/push.ts` → `sendPush(members, push)` and `pushToAdmin(push)` (the admin =
  the collector, like the admin's emails). Never throws, 5 s timeout per device, kept by the
  push service up to a day, sent as high priority (Android batches normal ones while a phone is
  idle, which can delay an "I paid" by minutes; a few a month cost no battery). A device the service says is gone (404/410) is deleted.
- **Words:** `lib/push-messages.ts` (pure, tested: no amounts, links stay inside the app).
  `PUSHES` says which emailed reminder kinds also push — the one place to change the table above.
- **Where pushes go out:**
  - Reminders (`lib/reminder-send.ts`): `sendOnce` / `sendAgain` push **after the email has
    gone**, outside the email's `try`, so a failed email (whose claim is given back and retried
    the next day) never pushes twice. "Email everyone their bill" (`sendPayables`) pushes in
    `after()`, so the button never waits on a push service.
  - "I paid" (`submitPayment`) and confirm/reject (`confirmPayment` / `rejectPayment` via
    `decideWaitingPayment`) push in `after()`, after the save. Their functions return nothing:
    `run()` takes a returned value as a page to go to.
  - Bill emails (`app/api/bill-email/route.ts`): `after()` the import, from the `bill_emails`
    row — imported → the month's Split Table; couldn't be added → the latest month's Manage
    (Bill inbox). Not in `importBillEmail`, which `npm run bills:import` also uses.
- **Safety switch (one database), like email:** only the live site pushes, and only to
  subscriptions saved on the live site (`push_subscriptions.live`), so one made on localhost
  never gets real pushes. Off the live site a push is only logged — or, with `PUSH_TEST=on`,
  sent to the **admin's own** devices as "[test → Ben] …".
- **Keys:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (built into the page) and `VAPID_PRIVATE_KEY` (read only
  by `lib/push.ts`, guard-tested). With either unset, push is off and nothing else changes.
  One key pair everywhere: a subscription only takes pushes signed with the key it was made
  with. Setup: [operations.md → Push notifications](../operations.md#push-notifications).
- Table: `push_subscriptions` (migration `0022`, [data-model.md](../data-model.md)).
- **Kill switch:** unregistering the service worker ([install-app.md](install-app.md)) also drops
  every device's subscription; everyone turns notifications on again afterwards.

## Rules
- No amounts and nothing anyone typed in a push. Pushes go out only through `lib/push.ts`.
- A push never blocks, slows or fails an email, a save or the daily job.

## Open items
[TODO.md](../TODO.md): telling the housemates.

## Built in
`feat/push-notifications`.
