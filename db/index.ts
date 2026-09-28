// The app's database client. Server-only: importing this from a Client Component fails the build,
// which keeps the connection string out of browser bundles.

import "server-only";
import type postgres from "postgres";
import { createClient, drizzleFor, type Database } from "./client";

const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

function getClient(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — copy .env.example to .env.local and fill it in.");
  // max: 1 — each serverless invocation needs only one connection; the Supabase pooler does the rest.
  return createClient(url, { max: 1 });
}

// Reuse one *connection* across hot reloads in dev (otherwise every reload opens a new one),
// but rebuild the Drizzle wrapper each time so it always knows the current schema.
const client = globalForDb.pgClient ?? getClient();
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db: Database = drizzleFor(client);

export * from "./schema";
