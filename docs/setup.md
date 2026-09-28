# First-time setup

Getting My House running on a new machine. Afterwards, day to day you only need
`npm run dev` ([commands.md](commands.md)).

1. **Install dependencies** — needs Node.js 22 or later (the project pins 24 in `.nvmrc`; with
   nvm: `nvm install && nvm use`). The Supabase client needs the WebSocket built into Node 22+.
   ```bash
   npm install
   ```
   This also installs the git hooks (Husky): lint on every commit, Conventional Commit messages.
2. **Create a Supabase project** at [supabase.com](https://supabase.com) (region:
   Southeast Asia / Singapore).
3. **Add your connection strings**
   ```bash
   cp .env.example .env.local
   ```
   In Supabase, open **Connect → ORMs → Drizzle** and paste the two URLs into `.env.local`:
   - `DATABASE_URL`: the **transaction pooler** (port 6543), used by the app
   - `DIRECT_URL`: the **session pooler** (port 5432), used by migrations, scripts and backups

   `.env.local` is git-ignored: it holds the database password. Never commit it.
4. **Create the tables and add the members**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
   Then load the August 2026 test data with `npm run db:seed:august` ([testing.md](testing.md)).
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

   **b. A sender Gmail for the email codes.** Create a separate Gmail for the app (e.g. "My
   House") — not your main one: an App Password opens the whole mailbox. Turn on 2-Step
   Verification, then create an **App Password** (Google Account → Security → App passwords).
   Supabase's built-in mailer only sends to the project's own team, so it can't be used.

   **c. Supabase → Authentication:**
   - **Sign In / Providers:** turn **off** "Allow new users to sign up" (invite-only). Turn on
     **Google** with the client ID and secret. Keep **Email** on, with "Confirm email" and
     "Secure email change" on; Email OTP expiry `600` seconds, length `6`.
   - **Emails → SMTP settings:** custom SMTP — host `smtp.gmail.com`, port `587`, the sender
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
     Optional: give the sender Gmail's Google profile the name "My House" and a house picture,
     so the emails show that instead of a letter.
     A code, not a link: a link opened from a phone's mail app lands in a different browser,
     and the sign-in fails.
   - **Rate limits:** emails sent — about 30 per hour.
   - **URL Configuration:** Site URL `http://localhost:3000`; Redirect URLs
     `http://localhost:3000/**`. (The production URL is added when going online —
     [TODO.md](TODO.md#before-going-online).)
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
6. **Start the app**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) and sign in.

**Optional, once:**
- `pg_dump` for backups: `brew install libpq && brew link --force libpq` ([operations.md → Backups](operations.md#backups)).
- The keep-alive secret on GitHub: `gh secret set DIRECT_URL` ([operations.md → Supabase free plan](operations.md#supabase-free-plan-the-project-goes-to-sleep)).

**After moving or renaming the project folder,** delete `.next/`: its build cache stores
absolute paths.
