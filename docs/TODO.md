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
- [ ] **Set up the passwords key, then fill in the Billers tab** ([billers](features/billers.md)).
      `BILLER_SECRET_KEY` in `.env.local` and Vercel, plus a copy in a password manager
      ([setup.md](setup.md) step 5g) — *before merging*, or saving a password on the live site
      says "Passwords aren't set up". Then type in the billers from the old sheet, and delete the
      passwords from the sheet.

- [ ] **Tell the housemates about the reminder emails** ([reminders](features/reminders.md)) —
      live since 2026-10-13. They come from the household Gmail; mark the first one "Not spam"
      if it lands there. A bill left unpaid now brings a reminder a few days later, then weekly.

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
- [ ] **Offline** ([install-app](features/install-app.md); installing already works). Offline
      *viewing* (the last months loaded, cached by `public/sw.js`) first; offline *editing* needs
      a sync queue and conflict handling. Cached pages put household finances on the device, so
      signing out must clear the cache.
- [ ] **Check the installed app on real phones** once it's online ([install-app](features/install-app.md)):
      Android install, iPhone Add to Home Screen + Google sign-in inside it, a link from Messenger.
      The phone menu's swipes ([months](features/months.md)): open from near the left edge on
      Android with gesture navigation and on iPhone, stays open when the finger lifts (if not,
      open on `touchend` in `useEdgeSwipe`), drag back to close. Pull-to-refresh gone inside the
      app, still there in a Chrome tab.
- [ ] **Backups off the laptop** ([operations → Backups](operations.md#backups)) — the free
      Supabase plan has no backups of its own, and ours are only on the laptop (skipped by choice
      when going online, below), so losing the laptop and the database together loses everything.
      After closing each month: Manage → Download backup, then put the zip in a cloud drive. Once,
      too: `.private/NOTES.md` there, and `BILLER_SECRET_KEY` in a password manager (a backup's
      biller passwords can't be read without it). Maybe password-protect the zips.

- [ ] **UI polish left from the 2026-10-13 audit** (all tabs; the fade-in, month switching,
      per-tab placeholders, 16px inputs and touch-size buttons are done):
      - Confirm a save after a dialog closes (a toast or similar); today it just closes.
      - Error text with `role="alert"`, and InlineInput's "Saved" in a live region, so screen
        readers announce them.
      - `prefers-reduced-motion` for the phone menu's slide and the dialogs' zoom.
      - Inline inputs: `focus-visible` instead of `focus`, and a stronger focus ring on white.
      - One style each for empty states, card headings and card padding (they differ by tab).
      - Small or faint text: sidebar group labels, the 10–11px text in the Split Table, the
        scroll chevron.

## Ideas (not decided)

- Google's consent screen says "Sign in to `<project-ref>.supabase.co`" ([auth](features/auth.md)).
  Once there's an own domain: free options are Google's own sign-in button
  (Google Identity Services → `signInWithIdToken`, shows the site's domain) and Google brand
  verification (shows "My House"; needs a privacy policy page). Supabase's custom domain
  does it too, but is paid.

- More reminders ([reminders](features/reminders.md)): a biller's due date coming up.

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
  - **GitHub's free checks for a public repo:** Dependabot security updates, secret scanning with
    push protection (check they're on).
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
