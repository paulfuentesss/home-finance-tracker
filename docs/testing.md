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
| `lib/settlement.test.ts` | The made-up August 2026 worked example; bill shares; Month Final rules; shared columns; split order; suggested payments |
| `lib/month-lock.test.ts` | Closing / reopening rules, pending bills blocking a close, balances that would vanish |
| `lib/advances-log.test.ts` | Advances Log grouping and split labels |
| `lib/bill-email/parse.test.ts` | Reading the August sample bill emails; refusing other senders; bill month; dates |
| `lib/bill-email/fees.test.ts` | The payment fee setting turns the sample emails into the fixture's bills |
| `lib/local-database.test.ts` | Test-data scripts recognise only a database on this machine as local |
| `lib/permissions.test.ts` | Who may change which advance; `safeNext` blocking open redirects after sign-in |
| `lib/actions-guard.test.ts` | Every Server Action goes through `run("admin" \| "member", …)`; only the three advance actions are open to members; no unknown Route Handlers, and `/receipts/[id]` checks the login first; the secret key and admin client stay out of the browser |
| `lib/receipts.test.ts` | Which receipt files are accepted (real type from the first bytes, size limit), their names in the bucket, resizing long screenshots |
| `lib/invites.test.ts` | Inviting / un-inviting: the order of the database and Supabase calls, rolling back a new login, never reusing a leftover one |

Money or rule changes: update the expectations in `lib/settlement.test.ts` (and the worked
example in `docs/settlement-rules.md`). Work the new values out by hand from the rules — never
copy them from the app's output, or the test only checks the app against itself.

## Fixtures (test data)

All test data is **made up**: the repo is public, so real names and amounts never go in it
(the household's real data is only in the database).

| Fixture | What it is | Used by |
|---|---|---|
| `lib/__fixtures__/august-2026.ts` | A made-up August 2026 (Ana, Ben, Cara, Dan, PA): members, bills, points, advances, rounded-per-share Month Finals. Keeps the edge cases: a points tie decided by split order, leftover centavos, a column without PA, a Manual column ₱0.02 over | `settlement.test.ts`, `npm run db:seed:august` |
| `lib/bill-email/__fixtures__/august-2026-emails.ts` | Bill emails for those bills in the providers' real formats, amounts made up | `parse.test.ts`, `npm run bills:import` |

**Adding an email fixture:** copy the plain-text body, then replace account and contract
numbers, names, phone numbers, invoice numbers, tracking links and amounts before saving —
this repo is public ([operations.md → Privacy & security](operations.md#privacy--security)).

## Test data in the database

`npm run db:seed:august` loads the made-up August (adding its members), and
`npm run bills:import -- meralco water pldt` imports the sample emails. Both run **only
against a local database** and refuse the live one (`lib/local-database.ts`), which holds the
household's real data:

```bash
npm run db:seed:august -- --replace   # reset the local August (and its bill emails)
```

## Trying things by hand

The dev loop: make the change → `npm run typecheck && npm run lint && npm test` → check the
pages in the browser with `npm run dev` running. Every page needs a login, so `curl` only
confirms the redirect to `/login`; the pages themselves are checked signed in, in the
browser. There's no dev bypass.

**Login, start to finish** (after [setup.md](setup.md) step 5). No real housemates needed: Gmail
ignores anything after a `+`, so `<your gmail>+house1@gmail.com`, `+house2`, … all land in
PA's inbox but are separate logins. Type your own address — not a placeholder like
`yourname+…`, whose codes would go to a stranger. Sign in as the housemate in a private window,
so PA stays signed in in the main one.
1. Signed out, open any page: you land on `/login`.
2. **Continue with Google** as PA: everything works as before, and the header shows PA.
3. Manage → Manage Housemates: type a test email for a housemate. On the login page, **Get a
   code by email** with it; the code arrives from the My House Gmail. Signed in as them:
   no Manage tab, no edit controls except their own advances in Advances Shared.
   A wrong code shows an error; an email that isn't invited gets the same "on its way"
   message, and nothing is sent.
4. As that housemate, run `updateBillTotal` from the browser console (or any PA-only action):
   "Only the admin can change this.", and nothing changes.
5. Change their email in Manage. In Supabase → Authentication → Users the **old** login is
   gone and the new one is there — the one check a fake can't make (`invites.test.ts`).
6. Clear their email while they're signed in: their next click goes to `/login`.
7. A Google account that isn't invited: "not invited", no loop. The My House Gmail works once no
   member uses it. It must be a test user on the Google consent screen, or Google blocks it
   before the app is reached ("Access blocked") and the app's check isn't tested.

**Receipts, start to finish** (after `npm run storage:setup`):
1. As PA, Receipts tab → a bill → **Attach proof** → a phone screenshot. It shows on the card;
   in Supabase → Storage → `receipts` the file is a few hundred KB, under `YYYY/MM/`.
2. Attach a second screenshot to the same bill: a small thumbnail below. Tap one: the viewer
   opens; **Open original** opens it in a new tab. Keep attaching: at the limit
   (`MAX_RECEIPTS_PER_ITEM`) Attach turns into a note, and picking more files than are left
   attaches none.
3. Record a payment on Settle Up; attach its proof in the Payments section.
4. Try a file that isn't an image (a PDF, or a `.txt` renamed `.png`): refused with a message.
5. Delete a proof from the viewer; then delete a bill or payment that has proof. Its files are
   gone from the bucket.
6. As a housemate: proofs are visible, no Attach or Delete. Signed out, `/receipts/<id>` goes
   to `/login`.
7. Close the month: Attach and Delete disappear; reopen it.

**Email-imported bills, start to finish** (needs a local database — the scripts refuse the live one):
1. `npm run db:seed:august -- --replace`, then `npm run bills:import -- meralco water pldt` —
   all three go to the Bill Inbox (August already has its bills).
2. Split Table: set Meralco's amount to `0` (Enter). Manage → Bill Inbox → Meralco → **Retry**.
3. Meralco is now **Pending** with the fee note. Try **Confirm**, **Discard**, closing the month
   (blocked), or deleting the column (the email returns to the inbox).
4. Each test uses the email up; repeat from step 1.
