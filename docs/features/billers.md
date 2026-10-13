# Billers & Accounts

## Status
✅ Working. Replaces the billers sheet in the old Google Sheet; the real details are typed into
the site, never into the repo.

## What it does
- **Billers & Accounts tab**: one card per company the household pays (electricity, water,
  internet…), the same in every month. Each card is a list of lines:
  - **Text**: an account number, the contract holder, how it's paid… Copy shows only on values
    people paste somewhere — one word with a digit or an @: account and ID numbers, emails, IP
    addresses (`isCopyable` in `lib/biller-copy.ts`), not names or notes.
  - **Link**: opens in a new tab. Only `http(s)://` links are accepted.
  - **Password**: shown as `••••••••`. Reveal shows it for 30 seconds; Copy appears once it's revealed.
  - **Heading**: a sub-title that groups the lines below it (e.g. "FAQs").
- **On a phone** each card starts closed, showing only the biller's name; tapping it opens the
  card. On a wide screen (two columns) and while editing, every card is open.
- **The admin** sees the tab read-only too (with an **Admin only** badge on lines housemates
  don't see) and taps **Edit** to change it; **Done** goes back. While editing, the admin
  adds, renames, reorders and deletes billers and lines, edits values in place,
  and changes a password with **Change** (the form always starts empty — a saved password is
  never shown back in it; saving it empty clears it).
- **Housemates** see the lines shared with them. Each line has a **Housemates can see** switch
  (on by default, passwords included); one switched off is marked **Admin only** and isn't
  sent to housemates at all. A biller with nothing shared doesn't show for them.
- "Preview as a housemate" shows exactly what they see.

## How it's built
- Route: `app/periods/[year]/[month]/billers/page.tsx`; UI: `components/billers.tsx`; dialogs
  (`AddBillerDialog`, `AddBillerFieldDialog`, `ChangeBillerSecretDialog`) in
  `components/entry-dialogs.tsx`; `components/copy-button.tsx`.
- Tables `billers` and `biller_fields` ([data-model.md](../data-model.md)). Not tied to a month.
- **Reads**: `getBillers()` in `lib/billers.ts` leaves out, on the server, every line the page's
  viewer may not see (`canSeeBillerField` in `lib/permissions.ts`; for a previewed housemate
  too). A password comes back only as "one is saved" — never its value, not even encrypted.
- **Passwords are encrypted** before they're saved: AES-256-GCM (`lib/secret-box.ts`, tested),
  with the key `BILLER_SECRET_KEY`, read only in `lib/biller-secrets.ts`. The database and the
  backups hold only the locked form (`v1.<iv>.<tag>.<ciphertext>`). A password is checked by
  hand rather than with zod's parse, because `run()` logs errors and a zod error carries the input.
- **Reveal** fetches `app/biller-secrets/[id]/route.ts`: it checks the login, then that the line
  is shared with the viewer (otherwise "not found", as for a missing one), then unlocks it and
  answers with `Cache-Control: no-store`. It checks the real viewer, not a preview.
- Changes are Server Actions in `actions.ts` (`addBiller`, `addBillerField`, `setBillerSecret`,
  `setBillerFieldVisibility`, …), all `run("admin", …)`.

## Rules
- Only the admin changes billers; housemates only see what's shared with them.
- The repo is public: real account numbers, passwords and names go into the site only.
- The key must be the same in `.env.local` and Vercel — both use the one database — and a copy
  kept in a password manager. Without it the saved passwords can't be read by anyone, and
  restoring a backup needs it too ([operations.md](../operations.md#privacy--security)).

## Open items
- Changing the key: there's no re-encrypt step yet. The `v1` prefix leaves room for one; until
  then, a new key means typing the passwords again.
- No log of who revealed what.

## Built in
`feat/billers`.
