// Puts receipt pictures back into the bucket from a backup (docs/operations.md → Backups): the
// receipts/ folder of an unzipped Download backup, or backups/receipts from storage:backup.
// Each file goes back under the same name (YYYY/MM/<id>.<ext>), the name the receipts table
// stores. Only adds what's missing: never overwrites or deletes, so it's safe to run again.
// The bucket must exist first (npm run storage:setup).
// Run: npm run storage:restore -- <folder>            (--dry-run: only list what it would upload)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { listReceiptFiles } from "../lib/receipt-files";
import { RECEIPTS_BUCKET, sniffReceiptType } from "../lib/receipts";
import { createAdminClient } from "../lib/supabase/admin";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const folder = args.find((a) => !a.startsWith("--")) ?? "";
if (!folder || !statSync(folder, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error("Give the receipts folder to restore: npm run storage:restore -- <folder>/receipts");
}
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local (docs/setup.md).");
}

const bucket = createAdminClient(supabaseUrl, secretKey).storage.from(RECEIPTS_BUCKET);

/** Every file under `dir`, as bucket paths ("2026/08/<id>.jpg"). Skips dotfiles like .DS_Store. */
function localFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return localFiles(path);
    return entry.isFile() ? [relative(folder, path).split(sep).join("/")] : [];
  });
}

const inBucket = new Set(await listReceiptFiles(bucket));
let uploaded = 0;
let present = 0;
const refused: string[] = [];
for (const path of localFiles(folder)) {
  if (inBucket.has(path)) {
    present++;
    continue;
  }
  const bytes = readFileSync(join(folder, path));
  // The bucket only takes receipt types; read the real one from the file's first bytes.
  const contentType = sniffReceiptType(bytes);
  if (!contentType) {
    refused.push(`${path} (not a JPG, PNG or WebP)`);
    continue;
  }
  if (dryRun) {
    console.log(`Would upload ${path}`);
  } else {
    const { error } = await bucket.upload(path, bytes, { contentType, upsert: false });
    if (error) throw new Error(`Couldn't upload ${path}: ${error.message}`);
  }
  uploaded++;
}
console.log(`${uploaded} ${dryRun ? "to upload (dry run: nothing changed)" : "uploaded"}, ${present} already there.`);
if (refused.length > 0) console.warn(`Skipped ${refused.length}:\n  ${refused.join("\n  ")}`);
