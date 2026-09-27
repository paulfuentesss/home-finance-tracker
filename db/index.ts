// The app's database client. Server-only: importing this from a Client Component fails the build,
// which keeps the connection string out of browser bundles.

import "server-only";
import { createDb, type Database } from "./client";

const globalForDb = globalThis as unknown as { db?: Database };

function getDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — copy .env.example to .env.local and fill it in.");
  // max: 1 — each serverless invocation needs only one connection; the Supabase pooler does the rest.
  return createDb(url, { max: 1 }).db;
}

// Reuse one client across hot reloads in dev, otherwise every reload opens a new connection.
export const db: Database = globalForDb.db ?? getDb();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;

export * from "./schema";
