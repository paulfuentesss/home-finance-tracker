// Dumps the app's tables to backups/home-finance-tracker-YYYY-MM-DD.sql. Supabase's free tier has no
// automatic backups, so run this after closing each month.
// Needs pg_dump: brew install libpq (its version must be >= Supabase's Postgres version).
// Run: npm run db:backup

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DIRECT_URL;
if (!url) throw new Error("DIRECT_URL is not set — fill in .env.local first.");

const dir = join(process.cwd(), "backups");
mkdirSync(dir, { recursive: true });
const file = join(dir, `home-finance-tracker-${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })}.sql`);

// public = app tables, drizzle = migration history.
const result = spawnSync(
  "pg_dump",
  [url, "--no-owner", "--no-privileges", "--schema=public", "--schema=drizzle", `--file=${file}`],
  { stdio: "inherit" },
);

if (result.error) {
  console.error("Could not run pg_dump. Install it with: brew install libpq && brew link --force libpq");
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Backup written to ${file}`);
