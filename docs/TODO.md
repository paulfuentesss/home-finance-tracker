# TODO

The one list of everything not done yet. Finished items are removed — the PR that did them is
the record, and the feature's page shows where it stands ([features/](features/README.md)).
Each line says what it is, which feature it belongs to, and what it's waiting on.

Nothing personal here: this repo is public. Household-specific to-dos go in `.private/NOTES.md`.

## Next

- [ ] **Login / auth** — the gate for going online. Blocks the bill inbox address, receipt
      uploads, going online at all, and the PWA. Choose a provider first.

## Later

- [ ] **Bill inbox address** ([email-bills](features/email-bills.md)) — *waits for login + deploy.*
      Pick an inbound-email provider that posts parsed mail to a webhook with a DKIM/SPF
      verdict; a long random address; a new `app/api/inbound-email/route.ts` verifies the signature,
      accepts only the providers' domains with DKIM pass (plus Gmail's forwarding-confirmation
      sender), then calls `importBillEmail(db, …)`; a Gmail filter forwards the three providers.
- [ ] **Receipt uploads** ([receipts](features/receipts.md)) — *waits for login.* Private
      Supabase Storage bucket; attach to bills, advances, payments.
- [ ] **A picture (GIF) for each member** ([manage](features/manage.md)), shown wherever the
      member appears (Who owes what cards, Advances Log) — *needs file storage, like receipts.*
- [ ] **PWA** — installable, polished on mobile, usable offline. Offline *viewing* (the last
      months loaded, cached by a service worker) first; offline *editing* needs a sync queue and
      conflict handling. *Waits for login:* cached pages put household finances on the device.

## Ideas (not decided)

- Read payment-confirmation emails to fill "Date paid" automatically
  ([email-bills](features/email-bills.md)). Wouldn't catch every payment fee, since some
  providers only report what they received.
- Show the How it works page's example numbers from the latest month instead of August.
- Rename the app from "MyHouse" to match the repo (`home-finance-tracker`)? Undecided.

## Before going online

Work through this before the first public deploy.

**Content & UX**
- [ ] Mobile check of every tab.
- [ ] Accessibility: alt text on images, real heading order, color contrast, keyboard-only
      navigation of the tabs, dialogs and inline inputs.
- [ ] Branded 404 and error pages still match the app (`app/not-found.tsx`, `app/error.tsx`).

**Discoverability**
- [ ] Keep it out of search engines: `noindex` metadata and a `robots.txt` that disallows all
      (it's a private household app).
- [ ] Page titles and the favicon.

**Operational**
- [ ] Login protects every page and Server Action; only the inbound-email webhook stays open
      (signature-checked).
- [ ] Hosting chosen; environment variables set there (`DATABASE_URL`, and the webhook secret).
- [ ] Domain / URL decided; HTTPS.
- [ ] Backups: the latest `npm run db:backup` taken and copied somewhere safe.
- [ ] Review [operations.md → Privacy & security](operations.md#privacy--security).
