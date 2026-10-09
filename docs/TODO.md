# TODO

The one list of everything not done yet. Finished items are removed — the PR that did them is
the record, and the feature's page shows where it stands ([features/](features/README.md)).
Each line says what it is, which feature it belongs to, and what it's waiting on.

Nothing personal here: this repo is public. Household-specific to-dos go in `.private/NOTES.md`.

## Next

- [ ] **Invite the housemates** ([auth](features/auth.md)). Login testing is finished
      (2026-10-09). A test housemate still has a `+` alias of PA's Gmail; swap in their real
      address. Anyone signing in with Google also needs to be a test user on the consent screen.

- [ ] **Housemates send their payment with proof** ([settle-up](features/settle-up.md),
      [receipts](features/receipts.md)). On Settle Up a housemate taps "I paid", types the amount
      and attaches the bank-transfer screenshot. It shows as **Waiting for PA** and doesn't count
      until PA checks his bank and taps **Confirm** (or rejects it); a month can't close while one
      waits — like pending bills. Needs `payments.status`, member actions in the guard test, and
      the settlement ignoring pending payments.

- [ ] **Go online** — hosting, the domain, and the checklist below. Blocks the bill inbox
      address.

- [ ] **Watch where sign-in emails land** ([auth](features/auth.md)): the first code went to
      Promotions, a later one to Primary. If housemates' codes keep getting filed away, move to
      a transactional email service (e.g. Resend) with an own domain once online.

## Later

- [ ] **Bill inbox address** ([email-bills](features/email-bills.md)) — *waits for deploy.*
      Pick an inbound-email provider that posts parsed mail to a webhook with a DKIM/SPF
      verdict; a long random address; a new `app/api/inbound-email/route.ts` verifies the signature,
      accepts only the providers' domains with DKIM pass (plus Gmail's forwarding-confirmation
      sender), then calls `importBillEmail(db, …)`; a Gmail filter forwards the three providers.
      The route is public: add it to `PUBLIC_PATHS` in `proxy.ts` and to the Route Handler
      allowlist in `lib/actions-guard.test.ts`.
- [ ] **Proof for advances** ([receipts](features/receipts.md)) — attach a receipt to an advance,
      ideally right in "Log new advance". Needs an `advance_id` on `receipts` (and in its
      one-owner check).
- [ ] **Clean up stray receipt files** ([receipts](features/receipts.md)) — a script listing files
      in the bucket with no `receipts` row (left if a removal after a delete failed), deleting
      them only with `--delete`. Rare; only if the bucket grows unexpectedly.
- [ ] **A picture (GIF) for each member** ([manage](features/manage.md)), shown wherever the
      member appears (Who owes what cards, Advances Log) — *file storage exists now (the receipts
      bucket); pictures would get their own bucket.*
- [ ] **PWA** — installable, polished on mobile, usable offline. Offline *viewing* (the last
      months loaded, cached by a service worker) first; offline *editing* needs a sync queue and
      conflict handling. Cached pages put household finances on the device, so signing out must
      clear the cache.

## Ideas (not decided)

- Google's consent screen says "Sign in to `<project-ref>.supabase.co`" ([auth](features/auth.md)).
  Once there's an own domain: free options are Google's own sign-in button
  (Google Identity Services → `signInWithIdToken`, shows the site's domain) and Google brand
  verification (shows "My House"; needs a privacy policy page). Supabase's custom domain
  does it too, but is paid.

- Read payment-confirmation emails to fill "Date paid" automatically
  ([email-bills](features/email-bills.md)). Wouldn't catch every payment fee, since some
  providers only report what they received.
- Show the How it works page's example numbers from the latest month instead of August.

## Before going online

Work through this before the first public deploy.

**Content & UX**
- [ ] Mobile check of every tab.
- [x] Accessibility in the code: alt text, a heading per page, labels on every field and icon
      button, color contrast (the amber buttons are a chosen exception: [decisions.md](decisions.md)),
      visible keyboard focus on the tabs.
- [ ] Accessibility by hand: use the app with the keyboard only (Tab, Enter, Escape) through
      the tabs, the dialogs and the inline inputs.
- [x] Branded 404 and error pages (`app/not-found.tsx`, `app/error.tsx`).

**Discoverability**
- [x] Kept out of search engines: `noindex` metadata and a `robots.txt` that disallows all.
- [x] Page titles (one per tab) and the app icons.

**Operational**
- [x] Login protects every page and Server Action ([features/auth.md](features/auth.md)); only
      the inbound-email webhook will stay open (signature-checked).
- [ ] Hosting chosen; environment variables set there: `DATABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
      (server-only), and the webhook secret.
- [ ] Domain / URL decided; HTTPS.
- [ ] Login knows the real URL: in Supabase → Authentication → URL Configuration set the
      **Site URL** to it (not just the Redirect URLs — a refused redirect falls back to the
      Site URL) and add `https://<domain>/**` to Redirect URLs. Keep the Google consent screen
      in Testing (its test users are a second allowlist).
- [ ] Sign in on the live site with Google and with an email code, and check a stranger's
      Google account is refused.
- [ ] Backups: the latest `npm run db:backup` and `npm run storage:backup` taken and copied
      somewhere safe.
- [ ] Review [operations.md → Privacy & security](operations.md#privacy--security).
