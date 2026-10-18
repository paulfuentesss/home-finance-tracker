// A real Postgres for tests (docs/testing.md → Database tests): PGlite runs Postgres inside the
// test process, so nothing here can reach the live database and CI needs no secrets.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite, types } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Database } from "@/db/client";
import * as schema from "@/db/schema";

const MIGRATIONS = join(__dirname, "..", "drizzle");

/** A fresh database with every migration in drizzle/ applied, like `npm run db:migrate`. */
export async function migratedDb(): Promise<PGlite> {
  // Money comes back as the exact text ("1000.50"), as it does from the live database's driver.
  // PGlite's default turns numeric into a float ("1000.5", and worse for large amounts).
  const pg = new PGlite({ parsers: { [types.NUMERIC]: (value: string) => value } });
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(join(MIGRATIONS, file), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) await pg.exec(statement);
    }
  }
  return pg;
}

/**
 * The app's Drizzle client on top of PGlite. Only the driver differs from `db` in "@/db" (same
 * schema, same query API), so the code under test can't tell.
 */
export function testDrizzle(pg: PGlite): Database {
  return drizzle(pg, { schema }) as unknown as Database;
}

let shared: Promise<{ pg: PGlite; db: Database }> | undefined;

/**
 * The test file's one database, migrated on first use (the slow part: a few seconds). Vitest gives
 * every test file its own modules, so files never share it. The code under test reaches it through
 * a mocked "@/db":
 *
 *   vi.mock("@/db", async () => (await import("./test-db")).dbModule());
 */
export function testDatabase(): Promise<{ pg: PGlite; db: Database }> {
  shared ??= migratedDb().then((pg) => ({ pg, db: testDrizzle(pg) }));
  return shared;
}

/** What "@/db" exports (the schema and `db`), with `db` on the test database. */
export async function dbModule() {
  return { ...schema, db: (await testDatabase()).db };
}

/** Empties every table and restarts the ids, so each test starts from the same blank database. */
export async function resetDb(pg: PGlite): Promise<void> {
  const { rows } = await pg.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  await pg.exec(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}
