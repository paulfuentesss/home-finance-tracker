# Login

## Status
✅ Working, online ([operations.md → Hosting](../operations.md#hosting-vercel)). What's left:
[TODO.md → Going online](../TODO.md#going-online).

## What it does
- Every page needs a signed-in household member. Two ways in, both through **Supabase Auth**:
  - **Continue with Google**, or
  - **a sign-in code by email** — for anyone without a Google account. Any email provider,
    no password.
- **Invite-only.** Sign-ups are off in Supabase: PA types someone's email in **Manage →
  Manage Housemates**, and only then can that email sign in. Clearing the email (or removing
  the housemate) takes the login away on their next click. The login page never says which
  emails are invited.
- **Two roles:**

  | | PA (`admin`) | Everyone else (`member`) |
  |---|---|---|
  | See every month and tab | ✅ | ✅ except Manage |
  | Log an advance | For anyone, into any column | Their own, into the month's default column (Advances Shared) |
  | Edit / delete an advance | Any | Their own, while it's in the default column — once PA moves it, it's PA's |
  | Bills, points, shared columns, payments, housemates, starting / closing / reopening months | ✅ | — |

  Everything still follows the month rules: nothing changes in a closed month.
- The header's **account menu** (`components/account-menu.tsx`) shows who's signed in — their
  colour dot and name, like the stat cards next to it. It opens to a greeting, their login
  email, what they can do, and **Sign out** (this device only; two clicks, so never by accident).
- **Preview as a housemate** (PA only): the account menu lists every housemate in the household
  now (admins aside). Picking one shows every month tab as they see it — no Manage tab, no
  PA-only controls, "Log new advance" only for themselves — under a "Previewing as …" strip with
  **Exit preview**. Their forms open but can't be sent, and the server refuses changes too (a
  click would otherwise save as PA). It ends on Exit preview, on signing out or in again, or
  after a few hours (`PREVIEW_SECONDS`).
- The login page: a Google-branded button, or "Get a sign-in code by email". The code step
  says where to look (inbox, Promotions, Spam), signs in by itself once 6 digits are typed, and
  counts down 60 seconds before "Resend code" (Supabase sends one email per person per minute).

## How it's built
**The gate is the data access layer, not the proxy.**
- `proxy.ts` (Next 16's middleware) refreshes the session cookie and sends logged-out visitors
  to `/login`. It's only a convenience.
- `lib/auth.ts` — `getViewer()` reads the login's user id from the verified token and finds
  the **active** member with that `auth_user_id` (never by email); `requireViewer()` sends
  anyone else to `/login`. Called by every page read (`getPeriodView`, `getLatestPeriod`,
  `getLatestPointsBills` in `lib/periods.ts`), by the Manage page (which also requires PA),
  and by `run()`.
- `run("admin" | "member", …)` in `app/periods/[year]/[month]/actions.ts` checks the caller
  before anything else. Only `addAdvance`, `updateAdvance` and `deleteAdvance` are `"member"`:
  for a member they force the payer to themselves and the column to the default one, and
  check `canManageAdvance` against the stored advance.
- `lib/permissions.ts` (pure, tested) — `Viewer`, `isAdmin`, `canManageAdvance`, and
  `safeNext` (where to go after signing in, blocking open redirects).
- **Invites:** `lib/invites.ts` creates a confirmed Supabase user for the email (with the
  secret key, `lib/supabase/admin-server.ts`) and stores its id on the member. Used by
  `updateMemberEmail` and `npm run auth:invite`. Postgres and Supabase can't share a
  transaction, so each database write is one statement and Supabase is called before or after
  it — at worst a stray login that matches nobody is left behind.
- **Sign-in:** `app/login/page.tsx` + `components/login-form.tsx`; public actions in
  `app/login/actions.ts` (`signInWithGoogle`, `sendEmailCode`, `verifyEmailCode`, `signOut`);
  Google comes back to `app/auth/callback/route.ts`, which swaps the code for a session and
  lets in only a linked, active member.
- **UI:** the month layout provides the viewer (`components/viewer-context.tsx`,
  `useViewer`, `useCanEdit`) so tabs hide controls that wouldn't work. The server checks again
  regardless.
- **Preview:** `lib/preview-browser.ts` sets a cookie (`PREVIEW_COOKIE` in `lib/preview.ts`, a
  member id, lasting `PREVIEW_SECONDS`) and tells the other open tabs to redraw. `previewFor(viewer)` /
  `getPreview()` in `lib/auth.ts` read it only when the real viewer is the admin and turn it into
  that member's viewer (`previewViewer` in `lib/permissions.ts`; a stale or malformed cookie means
  no preview). Only the month layout decides who the page is drawn for; the tabs take it from the
  context (`useViewer`), so one page never mixes PA's view with the housemate's. The context also
  carries `previewBy` (`usePreviewBy`, `usePreviewSwitch`) for the banner
  (`components/preview-banner.tsx`) and the account menu; `getPreviewChoices()` is the menu's list
  (empty for members). Every save turns off in the browser (`useIsPreviewing`, in
  `useDialogForm`, `InlineInput` and `ConfirmDeleteButton`), `run()` returns an error while
  `previewFor(viewer)` is set, and the Manage page redirects. Signing in or out deletes the cookie.
- **Safety net:** `lib/actions-guard.test.ts` fails if a Server Action skips `run()`, if a new
  Route Handler appears, if anything besides the three advance actions is opened to members, or
  if `run()` stops refusing changes during a preview.
- Tables: `members` (`email`, `auth_user_id`, `role`). Supabase keeps the logins themselves in
  its own `auth.users`.
- Setup (Google, the My House Gmail, Supabase settings, keys): [setup.md](../setup.md) step 5.

## Rules
- Server Actions and Route Handlers are public endpoints: every action goes through
  `run(access, …)`; a new Route Handler does its own auth and is added to the guard test.
- Match members on `auth_user_id` only — never the email in the token.
- Member rows are mapped field by field for the browser; `auth_user_id` never leaves the
  server, and nobody sees anyone else's email (only PA: in Manage, and a previewed housemate's
  in the account menu). The signed-in member's own
  email goes to their account menu.
- For Google, invite the exact address Google shows (dots included): Supabase links Google to
  the invited login by comparing the address.
- The preview changes only what's shown. Access checks (`requireViewer`, `run()`, the Manage
  page's admin check, the receipt-image route `app/receipts/[id]/route.ts`) always use the
  real viewer, and the cookie is ignored for anyone but the admin.
- PA's own login is changed with `npm run auth:invite`, not in Manage, so a typo can't lock
  him out.

## Open items
Going online: [TODO.md → Going online](../TODO.md#going-online).

## Built in
`feat/auth`; the preview in `feat/preview-as-housemate`.
