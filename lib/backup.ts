// The Download backup button (docs/operations.md → Backups; app/backup/route.ts): the database's
// rows as a .sql file, zipped with every receipt picture. pg_dump doesn't exist on Vercel, so
// Postgres writes the INSERTs itself — it does all the quoting, and amounts stay exact numerics.
// Data only: the tables come from drizzle/ (npm run db:migrate) before restoring.
// No DB import, so tests run it against PGlite (lib/backup.test.ts).

import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { dateInManila } from "./format";

/** Runs one SQL statement and returns its rows. */
export type Query = <T>(text: string) => Promise<T[]>;

export type TableInfo = {
  oid: number;
  /** The table name, quoted by Postgres (quote_ident) — safe to put into SQL. */
  ident: string;
  /** The primary key's columns, quoted, in key order ("" when there's none). */
  pk: string;
  /** Every column, quoted, in table order. */
  cols: string;
};

/**
 * Tables parents-first, so every row's foreign keys point at rows already restored.
 * `fks` are [child, parent] oids. A cycle (a table referencing itself included) throws: no table
 * order could restore it, and the household tables have none.
 */
export function orderTables<T extends { oid: number; ident: string }>(tables: T[], fks: [number, number][]): T[] {
  const byOid = new Map(tables.map((t) => [t.oid, t]));
  const parents = new Map(tables.map((t) => [t.oid, new Set<number>()]));
  for (const [child, parent] of fks) {
    if (child === parent) throw new Error(`Can't back up ${byOid.get(child)?.ident}: it references itself.`);
    // A parent outside these tables (another schema) isn't restored here anyway.
    if (byOid.has(parent)) parents.get(child)?.add(parent);
  }
  const ordered: T[] = [];
  const done = new Set<number>();
  while (ordered.length < tables.length) {
    const ready = tables.filter((t) => !done.has(t.oid) && [...parents.get(t.oid)!].every((p) => done.has(p)));
    if (ready.length === 0) {
      const stuck = tables.filter((t) => !done.has(t.oid)).map((t) => t.ident);
      throw new Error(`Can't back up: these tables reference each other in a cycle: ${stuck.join(", ")}.`);
    }
    for (const t of ready) {
      ordered.push(t);
      done.add(t.oid);
    }
  }
  return ordered;
}

export type BackupInfo = {
  now: Date;
  /** The git commit of the code making the backup (VERCEL_GIT_COMMIT_SHA), if known. */
  commit?: string;
};

/**
 * Every row of every table in `public`, as a .sql file to restore into an empty database (after
 * `npm run db:migrate` at the same commit). Tables are read from the catalog, so a new table is
 * included without changing this. Run it inside one REPEATABLE READ transaction so every table
 * is read at the same moment.
 */
export async function buildBackupSql(query: Query, info: BackupInfo): Promise<string> {
  const tables = await query<TableInfo>(`
    SELECT c.oid::int AS oid, quote_ident(c.relname) AS ident,
      coalesce((
        SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.n)
        FROM pg_index i
        CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, n)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE i.indrelid = c.oid AND i.indisprimary
      ), '') AS pk,
      (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
        FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS cols
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
    ORDER BY c.relname`);
  const fks = await query<{ child: number; parent: number }>(`
    SELECT conrelid::int AS child, confrelid::int AS parent
    FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`);
  // Restored ids keep their values, so each id counter must then move past the highest one.
  const counters = await query<{ oid: number; line: string }>(`
    SELECT c.oid::int AS oid,
      format('  PERFORM setval(pg_get_serial_sequence(%L, %L), max(%I)) FROM public.%I HAVING max(%I) IS NOT NULL;',
        'public.' || quote_ident(c.relname), a.attname, a.attname, c.relname, a.attname) AS line
    FROM pg_class c
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
      AND pg_get_serial_sequence('public.' || quote_ident(c.relname), a.attname) IS NOT NULL
    ORDER BY c.relname, a.attnum`);
  // Which schema version these rows belong to (npm run db:migrate keeps its history here).
  const [history] = await query<{ found: boolean }>(
    `SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS found`,
  );
  const [migrations] = history?.found
    ? await query<{ applied: number }>(`SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations`)
    : [];

  const sections: string[] = [];
  const counts: string[] = [];
  for (const t of orderTables(tables, fks.map((f) => [f.child, f.parent]))) {
    // Postgres turns each row into JSON and quotes it; json_populate_record turns it back, and
    // OVERRIDING SYSTEM VALUE keeps the ids (they're "generated always") so foreign keys still match.
    // Naming the columns makes a restore into a different schema fail loudly (a renamed or dropped
    // column) instead of quietly leaving it empty; a column added since gets its default.
    const order = t.pk ? t.pk.split(", ").map((col) => `t.${col}`).join(", ") : "row_to_json(t)::text";
    const rows = await query<{ value: string }>(
      `SELECT quote_literal(row_to_json(t)::text) AS value FROM public.${t.ident} t ORDER BY ${order}`,
    );
    counts.push(`${t.ident} ${rows.length}`);
    if (rows.length === 0) continue;
    const insert = `INSERT INTO public.${t.ident} (${t.cols}) OVERRIDING SYSTEM VALUE SELECT ${t.cols} FROM json_populate_record(NULL::public.${t.ident}, `;
    sections.push([`-- ${t.ident} (${rows.length})`, ...rows.map((r) => `${insert}${r.value});`)].join("\n"));
  }

  const header = [
    `-- My House backup: every row of the database (not its structure, which is drizzle/ in git).`,
    `-- Made ${dateInManila(info.now)} (Manila), ${info.now.toISOString()}.`,
    `-- Code: commit ${info.commit ?? "unknown"}; migrations applied: ${migrations?.applied ?? "unknown"}.`,
    `-- Rows: ${counts.join(", ")}.`,
    `--`,
    `-- Restore into an EMPTY database (docs/operations.md → Backups):`,
    `--   1. git checkout <the commit above>, then npm run db:migrate`,
    `--   2. psql "$DIRECT_URL" -q -f <this file>`,
    `-- It's one transaction: if anything fails (e.g. the database isn't empty), nothing changes.`,
  ];
  return [
    header.join("\n"),
    `\\set ON_ERROR_STOP on\nBEGIN;`,
    ...sections,
    // In a DO block so psql doesn't print a result for each one.
    ["-- id counters", "DO $$ BEGIN", ...counters.map((c) => c.line), "END $$;"].join("\n"),
    "COMMIT;",
  ].join("\n\n") + "\n";
}

export type ZipInput = {
  /** The .sql file's name inside the zip. */
  sqlName: string;
  sql: string;
  /** Receipt paths in the bucket; each goes into the zip under `receipts/`. */
  paths: string[];
  /** One file's bytes, or null if it was deleted since the listing (it's skipped). */
  download: (path: string) => Promise<Uint8Array | null>;
  onSkip?: (path: string) => void;
};

/**
 * The backup zip as a stream: the .sql first, then one picture per pull(), so the next one is
 * fetched only when the browser has taken the last. A failed download errors the stream — the
 * browser shows a failed download, and a cut-off zip (no index at the end) won't open.
 */
export function backupZipStream({ sqlName, sql, paths, download, onSkip }: ZipInput): ReadableStream<Uint8Array> {
  let zip: Zip;
  let next = 0;
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      zip = new Zip((err, chunk, final) => {
        if (cancelled) return;
        if (err) return controller.error(err);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      const file = new ZipDeflate(sqlName, { level: 6 });
      zip.add(file);
      file.push(new TextEncoder().encode(sql), true);
    },
    async pull() {
      if (next === paths.length) return zip.end();
      const path = paths[next++];
      const bytes = await download(path);
      if (cancelled) return;
      if (bytes === null) return onSkip?.(path);
      // Pictures are already compressed: stored as they are.
      const file = new ZipPassThrough(`receipts/${path}`);
      zip.add(file);
      file.push(bytes, true);
    },
    cancel() {
      cancelled = true;
      zip.terminate();
    },
  });
}
