# First-time setup

Getting My House running on a new machine. Afterwards, day to day you only need
`npm run dev` ([commands.md](commands.md)).

1. **Install dependencies** — needs Node.js 22 or later (the project pins 24 in `.nvmrc`; with
   nvm: `nvm install && nvm use`). The Supabase client needs the WebSocket built into Node 22+.
   ```bash
   npm install
   ```
   This also installs the git hooks (Husky): lint on every commit, Conventional Commit messages.
2. **Create a Supabase project** at [supabase.com](https://supabase.com) (region: one near
   the household — My House's is Seoul; the Vercel functions run in the same one,
   [operations.md → Hosting](operations.md#hosting-vercel)).
3. **Add your connection strings**
   ```bash
   cp .env.example .env.local
   ```
   In Supabase, open **Connect → ORMs → Drizzle** and paste the **session pooler** URL
   (port 5432) into `.env.local` twice. Both are the same value today; they're kept apart so the
   app's connection can change without touching the scripts':
   - `DATABASE_URL`: used by the app. Not the transaction pooler (port 6543): it hangs on
     queries sent back to back ([decisions.md](decisions.md))
   - `DIRECT_URL`: used by migrations, scripts and backups

   `.env.local` is git-ignored: it holds the database password. Never commit it.
4. **Create the tables and add PA**
   ```bash
   npm run db:migrate
   npm run db:seed         # adds PA, the collector; housemates are added later in Manage
   npm run storage:setup   # the private bucket for receipts
   ```
   On a **local** database, also load the made-up August 2026 with `npm run db:seed:august`
   ([testing.md](testing.md)); it refuses the live database.
5. **Set up login** (once per Supabase project — how login works: [features/auth.md](features/auth.md)).
   Everyone signs in with Google or with a code emailed to them; only invited emails get in.

   **a. Google sign-in** — [Google Cloud Console](https://console.cloud.google.com) → APIs &
   Services:
   - **OAuth consent screen:** External; scopes `email` and `profile` only. Leave it in
     **Testing** and add each member who'll use Google as a **test user** — a second
     allowlist on top of the invites. (The screen shows `<project-ref>.supabase.co`; a custom
     domain for it is a paid Supabase feature.)
   - **Credentials → Create OAuth client ID → Web application.** Authorized redirect URI:
     `https://<project-ref>.supabase.co/auth/v1/callback`. Keep the client ID and secret for
     step c.

   **b. The My House Gmail.** Create a separate Gmail for the household — not your main one:
   an App Password opens the whole mailbox. It sends the email codes, and the providers send
   their bills to it ([features/email-bills.md](features/email-bills.md)). Turn on 2-Step
   Verification, then create an **App Password** (Google Account → Security → App passwords).
   Supabase's built-in mailer only sends to the project's own team, so it can't be used.

   *Changing it later:* Supabase SMTP settings (username, password, sender email — step c),
   the support email on the Google consent screen (step a) if it was this Gmail, the billing
   email in each provider's account, and the bill-email script (step 7 — it lives in this
   Gmail's account). Send yourself a code to check, then revoke the old Gmail's App Password.

   **c. Supabase → Authentication:**
   - **Sign In / Providers:** turn **off** "Allow new users to sign up" (invite-only). Turn on
     **Google** with the client ID and secret. Keep **Email** on, with "Confirm email" and
     "Secure email change" on; Email OTP expiry `600` seconds, length `6`.
   - **Emails → SMTP settings:** custom SMTP — host `smtp.gmail.com`, port `587`, the My House
     Gmail and its App Password, sender name "My House".
   - **Emails → Templates → Magic Link** (used for sign-in codes). Subject — the code first, so
     it can be read from a phone notification:
     `{{ .Token }} is your My House sign-in code`
     Body — no links or images (those push mail towards Promotions/Spam, and a sign-in email
     with a link looks like phishing):
     ```html
     <div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;max-width:420px">
       <h2 style="margin:0 0 16px;font-size:20px">Your My House sign-in code</h2>
       <p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
       <p style="margin:0 0 8px">Type it on the sign-in page to sign in as <strong>{{ .Email }}</strong>. It works for 10 minutes.</p>
       <p style="margin:0 0 24px;color:#52525b">Don't share this code with anyone — PA will never ask for it. Didn't try to sign in? You can ignore this email.</p>
       <p style="margin:0;font-size:12px;color:#a1a1aa">My House · household bills, settled monthly</p>
     </div>
     ```
     Optional: give the My House Gmail's Google profile the name "My House" and a house picture,
     so the emails show that instead of a letter.
     A code, not a link: a link opened from a phone's mail app lands in a different browser,
     and the sign-in fails.
   - **Rate limits:** emails sent — about 30 per hour.
   - **URL Configuration:** Site URL `http://localhost:3000`; Redirect URLs
     `http://localhost:3000/**`, plus `http://localhost:3001/**` up to `http://localhost:3005/**`
     for the worktrees' sites ([commands.md → Working in parallel](commands.md#working-in-parallel)).
     Once the app is online, the Site URL is the live address instead and it's in Redirect URLs
     too ([operations.md → Hosting](operations.md#hosting-vercel)).
   - **JWT Keys:** use the asymmetric signing keys (migrate if the project still uses the
     legacy secret), so the app checks logins without calling Supabase each time.
   - Optional: **Settings → Data API** — turn it off; the app never uses it.

   **d. Keys** — Supabase → **Project Settings → API Keys**, into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` (the Project URL) and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
     (`sb_publishable_…`). Public by design: every table has RLS with no policies, so they
     can't read data.
   - `SUPABASE_SECRET_KEY` (`sb_secret_…`). **Server-only** — never with a `NEXT_PUBLIC_`
     name. It creates and deletes the invited logins.

   **e. Your own login** (there's no admin to invite you until then):
   ```bash
   npm run auth:invite -- PA you@gmail.com
   ```
   For Google, use the exact address Google shows (dots included). Then invite everyone else
   from **Manage → Manage Housemates**.

   **f. Check once:** sign in with Google as yourself (Supabase links Google to the invited
   login), and try a Google account that isn't invited — it should say "not invited".
   **g. The passwords key** (for the Billers tab: [features/billers.md](features/billers.md)).
   Run `openssl rand -base64 32` and put the result in `.env.local` as `BILLER_SECRET_KEY`.
   Add **the same value** in Vercel → Settings → Environment Variables (Production, Sensitive),
   then redeploy — localhost and the live site share one database, so a different key on each
   would lock one out of the other's passwords. Save a copy in a password manager: if it's lost,
   the saved passwords are lost with it.
6. **Start the app**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) and sign in.
7. **Bills by email** (once the app is online — how it works:
   [features/email-bills.md](features/email-bills.md)). A script in the My House Gmail sends
   the billers' emails to the app every hour.

   **a. The shared secret.** `openssl rand -base64 32` → in Vercel → Settings → Environment
   Variables add `BILL_EMAIL_SECRET` (Production, Sensitive), then **redeploy** (Deployments →
   ⋯ → Redeploy). Check: `curl -X POST https://<address>/api/bill-email` answers 401.

   **b. The script.** Signed in as the My House Gmail, open
   [script.google.com](https://script.google.com) → New project "My House bills" → paste
   `scripts/gmail/bill-forwarder.gs` → Project Settings → Script Properties: `APP_URL`
   (`https://<address>`), `BILL_EMAIL_SECRET` (the same value), `NOTIFY_TO` (your personal
   Gmail). Run `setup()` and allow access — Google says the app isn't verified because it's your
   own script: **Advanced → Go to My House bills**. Then run `testRun()`; its log lists each
   email it sent and the app's answer. It only sends bills received from the day of `setup()`.

   **c. Bills still going to your personal Gmail** (until each biller switches): in the
   personal Gmail, Settings → Forwarding → **Add a forwarding address** → the My House Gmail →
   open the confirmation email there and confirm. Then create a filter
   `from:(meralco.com.ph OR manilawater.com OR pldt.com.ph)` → **Forward it to** the My House
   Gmail (keep a copy). A filter only forwards new mail, and a bill forwarded by hand is refused
   (it's then from you, not the biller) — type those in as before. Delete the filter once every
   biller sends to the My House Gmail.

**Optional, once:**
- `pg_dump` for backups: `brew install libpq && brew link --force libpq` ([operations.md → Backups](operations.md#backups)).
- The keep-alive secret on GitHub: `gh secret set DIRECT_URL` ([operations.md → Supabase free plan](operations.md#supabase-free-plan-the-project-goes-to-sleep)).

**After moving or renaming the project folder,** delete `.next/`: its build cache stores
absolute paths.
