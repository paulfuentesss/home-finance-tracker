# TODO

The one list of everything not done yet. Finished items are removed — the PR that did them is
the record, and the feature's page shows where it stands ([features/](features/README.md)).
Each line says what it is, which feature it belongs to, and what it's waiting on.

Nothing personal here: this repo is public. Household-specific to-dos go in `.private/NOTES.md`.

## Next

- [ ] **Add the worktrees' local sites to Supabase's Redirect URLs** (Paul, in the dashboard):
      `http://localhost:3001/**` up to `http://localhost:3005/**` ([setup.md](setup.md) step 5,
      [commands.md → Working in parallel](commands.md#working-in-parallel)). Until then, signing
      in fresh on a worktree's site ends on the live site; a sign-in on `localhost:3000` carries over.

- [ ] **Tell the housemates about the reminder emails and push notifications**
      ([reminders](features/reminders.md), [notifications](features/notifications.md)) — emails
      live since 2026-10-13, push since 2026-10-18. The emails come from the household Gmail; mark
      the first one "Not spam" if it lands there. A bill left unpaid now brings a reminder a few
      days later, then weekly. Push is turned on per device: account menu → Turn on notifications.

- [ ] **Bills to the My House Gmail** ([email-bills](features/email-bills.md)) — *waiting on the
      billers.* Changed in their apps, and each biller was emailed (2026-10-11) after a PLDT bill
      still went to PA's personal email. Remove this once a bill from each has arrived at the My
      House Gmail. Steps in [setup.md](setup.md) step 5b.

- [ ] **See bills arrive by email** ([email-bills](features/email-bills.md)) — set up
      (2026-10-11, [setup.md](setup.md) step 7); *waiting for the first real bills.* Check each
      biller's first one shows as Pending — one forwarded from PA's personal Gmail too (if that
      one is refused, its DKIM didn't survive forwarding: switch to a second script there).
      Remove the forwarding filter once every biller sends to the My House Gmail.

- [ ] **Watch where sign-in emails land** ([auth](features/auth.md)): the first code went to
      Promotions, a later one to Primary. If housemates' codes keep getting filed away, move to
      a transactional email service (e.g. Resend) with an own domain once online.

## Later

- [ ] **Proof for advances** ([receipts](features/receipts.md)) — attach a receipt to an advance,
      ideally right in "Log new advance". Needs an `advance_id` on `receipts` (and in its
      one-owner check).
- [ ] **Clean up stray receipt files** ([receipts](features/receipts.md)) — a script listing files
      in the bucket with no `receipts` row (left if a removal after a delete failed), deleting
      them only with `--delete`. Rare; only if the bucket grows unexpectedly.
- [ ] **Offline viewing** ([offline](features/offline.md); a page already open, and its saves,
      already wait out a lost connection). Opening the last months loaded with no connection,
      cached by `public/sw.js`; saving while the app is closed would need a sync queue and
      conflict handling. Cached pages put household finances on the device, so signing out must
      clear the cache.
- [ ] **Backups off the laptop** ([operations → Backups](operations.md#backups) says how and
      why) — not copied anywhere safe yet (skipped by choice when going online, below). Each
      Download backup zip into a cloud drive, `.private/NOTES.md` there too, and
      `BILLER_SECRET_KEY` in a password manager. Maybe password-protect the zips.

- [ ] **One shared card component** (all tabs): every card is written out by hand
      (`rounded-xl border bg-white p-5 shadow-xs` and its `<h2>`, about 30 copies), which is how
      Settle Up drifted to other padding and title sizes (`docs/decisions.md`, 2026-10-18). A
      `SectionCard` with a `title` would hold the look once, so a new tab can't differ. No visual
      change; after the UI polish PR.
- [ ] **Removing someone while the next month starts** ([manage](features/manage.md)): if the
      daily job (or Start next month) starts a month at the very moment the admin removes someone,
      the start can still put them in the new month (they were active when it read the list), and
      the removal skips it (it wasn't open yet). They'd stay in it with shares of its equal bills.
      Rare (older than the month locks of 2026-10-18). A fix: Remove checks the latest month again
      after its locks.

## Ideas (not decided)

- **A history of changes** — who changed or deleted an amount, and when (a bill total, an advance,
  a payment). Deletes are permanent today, payments don't record who confirmed them, and an
  advance the admin logs for someone doesn't record who entered it. Would be an append-only table
  written inside `run()`'s transaction and shown to the admin. A schema change.

- **Error tracking** (e.g. Sentry's free plan): unexpected errors a housemate hits today show only
  "Something went wrong" and a line in Vercel's logs that nobody reads.

- Google's consent screen says "Sign in to `<project-ref>.supabase.co`" ([auth](features/auth.md)).
  Once there's an own domain: free options are Google's own sign-in button
  (Google Identity Services → `signInWithIdToken`, shows the site's domain) and Google brand
  verification (shows "My House"; needs a privacy policy page). Supabase's custom domain
  does it too, but is paid.

- More reminders ([reminders](features/reminders.md)): a biller's due date coming up.

- Keep a bill's history across column renames on Trends ([trends](features/trends.md)): bills
  are matched by name, so a renamed column starts a new series. Would need a stable id carried
  from month to month (copied by Start next month).

- A **12 months** option on Trends ([trends](features/trends.md)) once there's about a year of
  months: it shows the seasons (Meralco climbs in the hot months), which a 3- or 6-month view
  reads as "spending went up". `LOOKBACK_MONTHS` would need to cover the period before it too.

- Read payment-confirmation emails to fill "Date paid" automatically
  ([email-bills](features/email-bills.md)). Wouldn't catch every payment fee, since some
  providers only report what they received.

- More secure ([auth](features/auth.md), [billers](features/billers.md),
  [operations → Privacy & security](operations.md#privacy--security)). Nothing is unhackable;
  these close the gaps that are left, roughly most useful first:
  - **Housemates turn on 2-Step Verification** on the email they sign in with: whoever gets into
    that inbox gets into My House. A line in the invite and a question on How it works.
  - **A second step for the admin login** (Supabase MFA, an authenticator app): the admin can
    change everything and reveal every biller password.
  - **Log biller password reveals** (who, which, when), shown to the admin; maybe ask to sign in
    again before a reveal if the login is old. `/biller-secrets/<id>` keeps no record today.
  - **Sign out everywhere**, for a lost phone: sign-out is `scope: "local"` (this device only).
  - **Security headers** in `next.config.ts` (only `Cache-Control` now): a Content-Security-Policy,
    `frame-ancestors 'none'` (no embedding the site in another page), Referrer-Policy.
  - **GitHub's free checks for a public repo:** Dependabot *security* updates and secret
    scanning with push protection — switches in the repo's Settings → Code security (check
    they're on; the weekly version PRs are already set up: operations.md → Dependencies).
  - **Backups** off the laptop and password-protected: Later, above.
  - **Rotate the shared secrets** now and then (`BILL_EMAIL_SECRET`, `CRON_SECRET`; Vercel, plus
    the Gmail script for the first). `BILLER_SECRET_KEY` needs a script that re-encrypts every
    password first.

## Going online

Live on Vercel since 2026-10-10 ([operations.md → Hosting](operations.md#hosting-vercel)).

**Content & UX**
- [x] Mobile check of every tab (2026-10-11): Split, Advances, Receipts, Settle, Manage and How
      it works, checked at phone width and fixed where needed.
- [x] Accessibility in the code: alt text, a heading per page, labels on every field and icon
      button, color contrast (the amber buttons are a chosen exception: [decisions.md](decisions.md)),
      visible keyboard focus on the tabs.
- [x] *Skipped by choice (2026-10-11):* accessibility by hand — using the app with the keyboard
      only (Tab, Enter, Escape) through the tabs, the dialogs and the inline inputs.
- [x] Branded 404 and error pages (`app/not-found.tsx`, `app/error.tsx`).

**Discoverability**
- [x] Kept out of search engines: `noindex` metadata and a `robots.txt` that disallows all.
- [x] Page titles (one per tab) and the app icons.

**Operational**
- [x] Login protects every page and Server Action ([features/auth.md](features/auth.md)); only
      the bill-email and reminders routes stay open (each checked by its shared secret).
- [x] Hosting: Vercel, its environment variables set (`BILL_EMAIL_SECRET` is added when bills
      by email are turned on — the item above).
- [x] Address: a free `*.vercel.app` one, HTTPS by default. An own domain can come later.
- [x] Login knows the real URL (Supabase Site URL and Redirect URLs). Keep the Google consent
      screen in Testing (its test users are a second allowlist).
- [x] Signed in on the live site with Google and with an email code; a Google account that
      isn't invited is refused.
- [x] Backups taken before the first deploy (`npm run db:backup`, `npm run storage:backup`).
- [x] *Skipped by choice (2026-10-11):* copying `backups/`, Download backup zips and
      `.private/NOTES.md` off the laptop (cloud drive) — they're only on the laptop for now.
- [x] Reviewed [operations.md → Privacy & security](operations.md#privacy--security) on the live
      site: no secrets in git or in the browser code, the receipts bucket private, every table
      locked; the real names and amounts in the test data replaced with made-up ones.
