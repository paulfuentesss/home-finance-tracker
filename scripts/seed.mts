// Inserts the 5 household members. Safe to run repeatedly.
// Run: npm run db:seed

import { createDb } from "../db/client";
import { members } from "../db/schema";
import { HOUSEHOLD_MEMBERS } from "../lib/__fixtures__/august-2026";

const url = process.env.DIRECT_URL;
if (!url) throw new Error("DIRECT_URL is not set — fill in .env.local first.");

const { db, client } = createDb(url, { max: 1 });

try {
  const inserted = await db
    .insert(members)
    // The collector (PA) is the admin; logins are added later with `npm run auth:invite`.
    .values(HOUSEHOLD_MEMBERS.map((m) => ({ ...m, role: m.isCollector ? ("admin" as const) : ("member" as const) })))
    .onConflictDoNothing({ target: members.name })
    .returning({ name: members.name });
  console.log(
    inserted.length
      ? `Inserted members: ${inserted.map((m) => m.name).join(", ")}`
      : "Members already present — nothing to do.",
  );
} finally {
  await client.end();
}
