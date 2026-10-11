// Adds the collector, PA, so a new database has someone to sign in as (`npm run auth:invite --
// PA <email>`); everyone else is added in Manage → People. Safe to run repeatedly, and on the
// live database: it holds no test data. (The made-up August's members come with
// `npm run db:seed:august`, local only.)
// Run: npm run db:seed

import { createDb } from "../db/client";
import { members } from "../db/schema";

const url = process.env.DIRECT_URL;
if (!url) throw new Error("DIRECT_URL is not set — fill in .env.local first.");

const { db, client } = createDb(url, { max: 1 });

try {
  const inserted = await db
    .insert(members)
    // The collector is the admin; their login is added with `npm run auth:invite`.
    .values({ name: "PA", sortOrder: 5, isCollector: true, role: "admin" })
    .onConflictDoNothing()
    .returning({ name: members.name });
  console.log(inserted.length ? "Added PA (the collector)." : "PA (or another collector) is already there — nothing to do.");
} finally {
  await client.end();
}
