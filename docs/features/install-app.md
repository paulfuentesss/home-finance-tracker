# Install as an app

## Status
✅ Working. My House can be installed on a phone or computer and opens full-screen from the home
screen, like an app. Not offline yet: that's in [TODO.md](../TODO.md).

## What it does
- A small **Install My House** card at the bottom of the screen, on every page including the
  login page, so a newcomer sees it on their first visit. What it says depends on the browser:
  - **Android (Chrome, Samsung Internet), computer (Chrome, Edge):** an **Install** button that
    opens the browser's own install dialog. The browser decides when it may offer this, so the
    card can appear after a moment of use rather than instantly. The browser's menu (⋮ →
    **Install app** / **Add to Home screen**) works any time too.
  - **iPhone / iPad (any browser):** Apple has no install button for websites, so the card
    explains it: **Share** (or ••• then Share) → **Add to Home Screen**.
  - **Messenger, Facebook or Instagram's built-in browser** (when someone taps a shared link
    there): those can't install anything, so the card says to open the page in Chrome or Safari.
  - Desktop Safari and Firefox get no card (Safari: File → Add to Dock).
- No card inside the installed app. **Not now** / **Got it** hides it until the next day
  (remembered in that browser; a private window shows it again).
- **Already installed:** Chrome and Edge know, and never offer to install again, so the card
  stays away. Safari on iPhone can't tell, so the iPhone card has **I've added it**, which stops
  it on that phone for good.
- **Launch screen:** the installed app opens on a small My House screen (the house and name fade
  in, then a thin amber line sweeps under them) that stays up while the month loads, then gives
  way to it (or to the login page when signed out). It replaces the phone's own start-up screen
  almost at once: on Android that's the big icon, on iPhone a blank white screen. After about
  15 seconds it adds "Taking longer than usual" with **Try again**. Android apps installed
  before it switch over by themselves once Chrome refreshes the app's details (about a day);
  **an iPhone that added the app earlier keeps opening the month directly** until it's removed
  and added again, because iOS reads the start page only when it's added.
- **Install app** in the account menu (the name at the bottom of the sidebar) brings the card
  back any time, whatever was tapped before. Where the browser offers no install dialog
  (already installed, or Firefox/desktop Safari), it says where the browser's own menu option is.
  Not shown inside the installed app.
- Signing in: on Android the installed app shares Chrome's login, so people stay signed in. **On
  iPhone the home-screen app keeps its own login**, so housemates sign in once more inside it
  ([auth.md](auth.md)).
- No connection: instead of the browser's error, pages show a small "No connection — Try again"
  screen. Nothing is stored on the device.
- **No pull-to-refresh inside the installed app** (a browser tab keeps it): a stray pull would
  reload and wipe what's being typed. Nothing depends on it:
  - Data: every save redraws the page, switching tabs loads that tab fresh, and coming back to
    the app after a while redraws the month ([months](months.md)).
  - New versions: after a deploy, the next tab or month switch (or coming back to the app)
    notices the new version and reloads the whole page; opening the app always loads it fresh.
    A save made from a page left open across a deploy shows **My House was updated** with a
    **Reload** button instead of the usual error page.
- **How it works** has a question for housemates: "How do I put My House on my phone?" (Android,
  iPhone, the Messenger/Facebook/Instagram browsers, and swiping in from the left for the menu).

## How it's built
- `app/manifest.ts` — the web app manifest (name, start page, full-screen, colours, icons), served
  at `/manifest.webmanifest`; Next links it from every page. `start_url` is the launch screen
  (`/open`); `id` stays `/`, so apps installed before it are still the same app.
- `app/open/page.tsx` — the launch screen: static (built once, served from the CDN), no data, no
  login, so it shows the moment the app opens. The house is `app/icon.svg` (served at
  `/icon.svg`); the fade and sweep are the `launch-*` classes in `app/globals.css` (reduced
  motion: fade only, and the line gently pulses). `components/launch-redirect.tsx` runs
  `router.replace("/")` on load: an in-app navigation, so the launch screen stays up until the
  month is ready, and stays out of the back history. Signed out, the proxy's redirect to
  `/login` is followed the same way. This is how a cold open gets a designed wait without a
  `loading.tsx` above the month layout ([decisions](../decisions.md), 2026-10-16).
- `app/icons/[file]/route.tsx` — the three PNG install icons (192, 512 and a "maskable" 512 that
  Android crops to a circle), drawn at build time from `app/icon.svg` with `ImageResponse`, so the
  house has one source. iPhones use `app/apple-icon.png`.
- `public/sw.js` — the service worker. Its fetch handler only answers page loads, and only when
  the network fails (the offline screen); everything else goes straight to the network. It uses
  no Cache Storage. It also shows push notifications and opens their page when tapped
  ([notifications.md](notifications.md)). Chrome wants a real fetch handler before it offers to install, which is the
  main reason it exists. `next.config.ts` sends `/sw.js` with `Cache-Control: no-store`, so a
  fixed worker reaches phones on their next visit.
- `app/globals.css` — `overscroll-behavior-y: none` under `@media (display-mode: standalone)`
  turns pull-to-refresh off in the installed app only.
- New versions: Next compares the build of each page it loads with the page already open and
  reloads in full on a mismatch. A save from an old page throws Next's
  `UnrecognizedActionError`; `app/error.tsx` spots it and offers a full reload (its usual
  **Try again** would redraw the same old page).
- `components/install-prompt.tsx` — the card, in the root layout (`app/layout.tsx`, which also
  sets `appleWebApp` and the `themeColor`). It registers the worker, keeps Chrome's
  `beforeinstallprompt` event, and picks the card from the browser. "Not now" and "I've added
  it" are kept in `localStorage`. `components/account-menu.tsx` has the **Install app** item
  (`openInstallCard`, hidden inside the installed app by `useShowInstallItem`). "Installed app or
  browser?" and the iPhone/iPad check come from `lib/devices.ts`, shared with the admin's
  [who's using it](manage.md) on Manage.
- `proxy.ts` — `manifest.webmanifest`, `sw.js` and the launch screen (`open$`) are in the
  matcher's skip list; the icons pass as `.png` and `.svg`. Browsers fetch the manifest **without
  cookies**, so a login redirect there would quietly make the app uninstallable. The launch
  screen skips the login check so it shows at once; the `/` navigation right after is checked.

## Rules
- The manifest, worker, icons and launch screen stay public and hold nothing about the
  household. `lib/actions-guard.test.ts` lists the icon route and the launch screen
  (`PUBLIC_ROUTES`, `PUBLIC_PAGES`) and fails if they ever import the database or the login.
- The worker never caches pages or data. Offline viewing would put household finances on the
  phone and needs clearing on sign-out — a separate job ([TODO.md](../TODO.md)).
- **Kill switch:** if the worker ever breaks the site on phones, replace `public/sw.js` with the
  two lines in its header comment (it unregisters itself) and deploy. That also turns off every
  device's notifications; each person turns them on again afterwards.

## Open items
- Offline viewing: [TODO.md](../TODO.md).
- Check on real phones after it's online: Android install, iPhone Add to Home Screen + Google
  sign-in inside the app (the email code is the fallback), a link opened from Messenger, the
  launch screen.

## Built in
`feat/install-app`; the launch screen in `feat/launch-screen`.
