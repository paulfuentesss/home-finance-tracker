// Shared factory for a Drizzle client. Used directly by scripts/* (which run under tsx,
// outside Next.js); app code should import `db` from "@/db" instead.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createClient(url: string, options: postgres.Options<Record<string, never>> = {}) {
  return postgres(url, {
    // Supabase's transaction pooler (port 6543) doesn't support prepared statements.
    prepare: false,
    // Close idle connections and recycle old ones, so a connection left behind by a dev
    // hot reload can't sit on locks (that once blocked a migration for 38 minutes).
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    ...options,
  });
}

export function drizzleFor(client: postgres.Sql) {
  return drizzle(client, { schema });
}

export function createDb(url: string, options: postgres.Options<Record<string, never>> = {}) {
  const client = createClient(url, options);
  return { db: drizzleFor(client), client };
}

export type Database = ReturnType<typeof drizzleFor>;
