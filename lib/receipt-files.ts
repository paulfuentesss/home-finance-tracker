// Every file in the receipts bucket, for the backups (docs/operations.md → Backups): the
// Download backup zip (app/backup/route.ts), `npm run storage:backup` and `storage:restore`.
// Relative imports only, so the tsx scripts can load it.

import type { createAdminClient } from "./supabase/admin";

export type ReceiptBucket = ReturnType<ReturnType<typeof createAdminClient>["storage"]["from"]>;

const PAGE = 1000;

/** Every file's path in the bucket (`YYYY/MM/<id>.<ext>`). Folders come back without an id. */
export async function listReceiptFiles(bucket: ReceiptBucket, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`Couldn't list ${prefix || "the bucket"}: ${error.message}`);
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await listReceiptFiles(bucket, path)));
      else files.push(path);
    }
    if (data.length < PAGE) return files;
  }
}

/** Storage's "no such file" (e.g. a receipt deleted while a backup was running). */
export function isMissingFile(error: unknown): boolean {
  const e = error as { status?: number; statusCode?: string; code?: string } | null;
  return e?.status === 404 || e?.statusCode === "404" || e?.code === "NoSuchKey";
}
