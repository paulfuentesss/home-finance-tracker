// Imports bill emails into the database exactly as the inbound-email webhook will, so the
// whole flow can be tried locally (docs/settlement-rules.md → "Email-imported bills").
//
//   npm run bills:import -- meralco water pldt   # the August 2026 sample emails
//   npm run bills:import -- path/to/email.json   # { messageId, from, subject, receivedAt, text }
//
// The August samples land in August 2026 — which already has its bills, so they go to the
// Bill inbox. To see them arrive as pending bills, set August's columns to ₱0 first.

import { readFile } from "node:fs/promises";
import { createDb } from "../db/client";
import {
  MERALCO_AUGUST_2026,
  PLDT_AUGUST_2026,
  WATER_AUGUST_2026,
} from "../lib/bill-email/__fixtures__/august-2026-emails";
import type { BillEmail } from "../lib/bill-email/parse";
import { importBillEmail } from "../lib/bill-import";

const SAMPLES: Record<string, BillEmail> = {
  meralco: MERALCO_AUGUST_2026,
  water: WATER_AUGUST_2026,
  pldt: PLDT_AUGUST_2026,
};

const url = process.env.DIRECT_URL;
if (!url) throw new Error("DIRECT_URL is not set — fill in .env.local first.");
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: npm run bills:import -- <meralco|water|pldt|path/to/email.json> …");
  process.exit(1);
}

const { db, client } = createDb(url, { max: 1 });
try {
  for (const arg of args) {
    const email: BillEmail = SAMPLES[arg] ?? JSON.parse(await readFile(arg, "utf8"));
    const outcome = await importBillEmail(db, email);
    const detail =
      outcome.kind === "imported"
        ? "added as a pending bill"
        : outcome.kind === "unmatched"
          ? `in the Bill inbox: ${outcome.reason}`
          : "already imported — skipped";
    console.log(`${arg}: ${detail}`);
  }
} finally {
  await client.end();
}
