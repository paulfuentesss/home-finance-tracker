// Shared factory for a Drizzle client. Used directly by scripts/* (which run under tsx,
// outside Next.js); app code should import `db` from "@/db" instead.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(url: string, options: postgres.Options<Record<string, never>> = {}) {
  // prepare: false — Supabase's transaction pooler (port 6543) doesn't support prepared statements.
  const client = postgres(url, { prepare: false, ...options });
  return { db: drizzle(client, { schema }), client };
}

export type Database = ReturnType<typeof createDb>["db"];
