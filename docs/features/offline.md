# No connection

## Status
✅ Working, in a browser tab and in the installed app. What's on screen stays, saves wait for the
connection, and a strip says so. Not offline *viewing* (opening a page with no connection): that's
in [TODO.md](../TODO.md).

## What it does
- **The page that's open stays usable to read.** An amber **No connection** strip appears at the
  top of every signed-in page, stays in view while scrolling, and goes away by itself once the
  connection is back.
- **Saving waits instead of failing.** An inline amount stays greyed out, a dialog's button stays
  on its "saving" state, "I paid" stays pending. When the connection comes back, the save goes
  through by itself (the ✓ appears, the dialog closes). Nothing has to be typed again.
- **Moving to another month or tab waits too.** The arrow or month tapped keeps its spinner, and
  the page opens once the connection is back.
- **Opening or reloading a page** with no connection shows the service worker's "No connection"
  screen with **Try again** ([install-app](install-app.md)). Chrome shows its own offline page
  the very first time someone visits, before the worker is installed.
- "No connection" includes Wi-Fi without internet: a request that can't reach the site counts,
  not just the phone's network switch.

## How it's built
- `next.config.ts` — `experimental.useOffline` (Next 16.3, experimental). When a save (Server
  Action), a navigation or a prefetch fails because the `fetch` itself was rejected, Next
  doesn't throw: it marks the app offline, checks the connection with a `HEAD` request (after
  0.5 s, 1 s, 2 s, then every 3 s, and at once on the browser's `online` event), and runs the
  request once a check gets through. A server error (a 500, a refused change) is not a network
  failure and still shows as before. Next's guide:
  `node_modules/next/dist/docs/01-app/02-guides/offline-support.md`.
- `components/offline-banner.tsx` — the strip, from Next's `useOffline()` hook (`next/offline`).
  It sits in `AppShell` (`components/app-sidebar.tsx`), in one sticky box with the phone's top bar
  so it doesn't scroll away; above the preview strip.
- Nothing changed in the forms: `InlineInput`, `useDialogForm` and the confirm buttons already show
  a pending state, and their `{ ok: false, error }` results still show as before.
- `public/sw.js` only answers full page loads, so it never sees saves or in-app navigations.
  The app's own `fetch` calls (Reveal on Billers, `/api/seen`, `/api/push`) aren't covered by
  the setting and already handle a failure themselves.

## Rules
- **Keep My House open while a save waits.** The waiting save lives in the page: closing the app or
  the tab drops it. The strip says so.
- **A save can, rarely, go through twice:** if the connection drops after the server saved but
  before its answer arrived, the browser sees a failure and Next sends it again. The fix is to
  delete the extra entry ([decisions](../decisions.md), 2026-10-17).
- **Test it on a built site**, not `npm run dev` (Next's guide: dev mode isn't reliable for this):
  in a worktree with no dev server running, `npm run build && npx next start -p <port>`, then
  Chrome DevTools → Network → **Offline**. Stop it before `npm run dev` there (they share `.next/`).
- **Kill switch:** if this ever misbehaves, remove `useOffline` from `next.config.ts` and deploy.
  Saves made offline then fail into `app/error.tsx` again, and the strip never shows.

## Open items
- Offline viewing: [TODO.md](../TODO.md).
- Check on a real phone in airplane mode, in Chrome and the installed app ([TODO.md](../TODO.md)).

## Built in
`feat/offline`.
