// Download backup (Manage tab; docs/operations.md → Backups): a zip of every row in the database
// (a .sql file, lib/backup.ts) and every receipt picture. Admin only: it holds everything,
// login emails included. Whatever can fail runs before the download starts, so a failure shows
// as an error page; a picture failing mid-download makes the browser report a failed download.

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getViewer } from "@/lib/auth";
import { backupZipStream, buildBackupSql } from "@/lib/backup";
import { dateInManila } from "@/lib/format";
import { isAdmin } from "@/lib/permissions";
import { isMissingFile, listReceiptFiles } from "@/lib/receipt-files";
import { receiptStorage } from "@/lib/supabase/admin-server";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in to download a backup.", { status: 401 });
  if (!isAdmin(viewer)) return new Response("Only the admin can download a backup.", { status: 403 });

  const now = new Date();
  const date = dateInManila(now);
  // One REPEATABLE READ snapshot: every table as it was at the same moment, so a bill saved
  // mid-backup can't leave a row whose parent isn't in the file.
  const dump = await db.transaction(
    (tx) =>
      buildBackupSql(async <T,>(text: string) => (await tx.execute(sql.raw(text))) as unknown as T[], {
        now,
        commit: process.env.VERCEL_GIT_COMMIT_SHA,
      }),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  const bucket = receiptStorage();
  const paths = await listReceiptFiles(bucket);

  const zip = backupZipStream({
    sqlName: `home-finance-tracker-data-${date}.sql`,
    sql: dump,
    paths,
    async download(path) {
      const { data, error } = await bucket.download(path);
      if (error && isMissingFile(error)) return null;
      if (error) {
        console.error(`Backup: couldn't download receipt ${path}`, error);
        throw new Error(`Couldn't download receipt ${path}.`);
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    onSkip: (path) => console.warn(`Backup: receipt ${path} was deleted during the backup; skipped.`),
  });
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="home-finance-tracker-backup-${date}.zip"`,
      // Everything the household has, login emails included: no cache may keep a copy.
      "Cache-Control": "private, no-store",
    },
  });
}
