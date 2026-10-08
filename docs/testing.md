# Testing

## Automated tests

`npm test` runs every `*.test.ts` with Vitest in under a second. Unit tests never touch the
database or React: the money math and rules are pure code in `lib/`. Two exceptions, both
still offline: `invites.test.ts` runs `lib/invites.ts` against a fake database and a fake
Supabase, and `actions-guard.test.ts` reads the source files.

**CI:** GitHub Actions runs `npm run typecheck`, `npm run lint` and `npm test` on every pull
request and every push to main (`.github/workflows/checks.yml`); a failure shows as a red ✗
on the PR. It needs no secrets because no test touches the database — keep it that way.

| Test file | Covers |
|---|---|
| `lib/money.test.ts` | Centavo conversion, parsing typed amounts, equal and weighted splits |
| `lib/settlement.test.ts` | August 2026 reproduces the household sheet; bill shares; Month Final rules; shared columns; split order; suggested payments |
| `lib/month-lock.test.ts` | Closing / reopening rules, pending bills blocking a close, balances that would vanish |
| `lib/advances-log.test.ts` | Advances Log grouping and split labels |
| `lib/bill-email/parse.test.ts` | Reading the real August bill emails; refusing other senders; bill month; dates |
| `lib/bill-email/fees.test.ts` | The payment fee setting matches the August receipts |
| `lib/permissions.test.ts` | Who may change which advance; `safeNext` blocking open redirects after sign-in |
| `lib/actions-guard.test.ts` | Every Server Action goes through `run("admin" \| "member", …)`; only the three advance actions are open to members; no unknown Route Handlers; the secret key and admin client stay out of the browser |
| `lib/invites.test.ts` | Inviting / un-inviting: the order of the database and Supabase calls, rolling back a new login, never reusing a leftover one |

Money or rule changes: update the expectations in `lib/__fixtures__/august-2026.ts`, which
mirror the household sheet — if the app and the sheet disagree, find out why before changing
either.

## Fixtures (test data)

| Fixture | What it is | Used by |
|---|---|---|
| `lib/__fixtures__/august-2026.ts` | August 2026 from the household Google Sheet: members, bills, points, advances, expected Month Finals | `settlement.test.ts`, `npm run db:seed:august` |
| `lib/bill-email/__fixtures__/august-2026-emails.ts` | The three bill emails behind August's bills, **scrubbed** | `parse.test.ts`, `npm run bills:import` |

**Adding an email fixture:** copy the plain-text body, then remove account and contract
numbers, names, phone numbers, invoice numbers and tracking links before saving — this repo
is public ([operations.md → Privacy & security](operations.md#privacy--security)).

## Test data in the database

August 2026 in the database is test data loaded from the fixture:

```bash
npm run db:seed:august -- --replace   # reset August (and its bill emails) to the sheet
```

It deletes and reloads only August 2026. Safe while August is the only month; once real
months follow it, a reset changes their carry-over — back up first (`npm run db:backup`).

## Trying things by hand

The dev loop: make the change → `npm run typecheck && npm run lint && npm test` → check the
pages in the browser with `npm run dev` running. Every page needs a login, so `curl` only
confirms the redirect to `/login`; the pages themselves are checked signed in, in the
browser. There's no dev bypass.

**Login, start to finish** (after [setup.md](setup.md) step 5):
1. Signed out, open any page: you land on `/login`.
2. **Continue with Google** as PA: everything works as before, and the header shows PA.
3. Manage → Manage Housemates: type a test email for a housemate. On the login page, **Get a
   code by email** with it; the code arrives from the sender Gmail. Signed in as them:
   no Manage tab, no edit controls except their own advances in Advances Shared.
   A wrong code shows an error; an email that isn't invited gets the same "on its way"
   message, and nothing is sent.
4. As that housemate, run `updateBillTotal` from the browser console (or any PA-only action):
   "Only PA can change this.", and nothing changes.
5. Change their email in Manage. In Supabase → Authentication → Users the **old** login is
   gone and the new one is there — the one check a fake can't make (`invites.test.ts`).
6. Clear their email: their next click goes to `/login`.
7. A Google account that isn't invited: "not invited", no loop.

**Email-imported bills, start to finish:**
1. `npm run db:seed:august -- --replace`, then `npm run bills:import -- meralco water pldt` —
   all three go to the Bill Inbox (August already has its bills).
2. Split Table: set Meralco's amount to `0` (Enter). Manage → Bill Inbox → Meralco → **Retry**.
3. Meralco is now **Pending** with the fee note. Try **Confirm**, **Discard**, closing the month
   (blocked), or deleting the column (the email returns to the inbox).
4. Each test uses the email up; repeat from step 1.
