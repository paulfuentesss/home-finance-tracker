// Copies the receipt files to backups/receipts/ (docs/operations.md → Backups). `db:backup`
// saves the database only; the files live in Supabase Storage. Downloads only files it doesn't
// have yet, so running it after every month is quick.
// Run: npm run storage:backup

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { listReceiptFiles } from "../lib/receipt-files";
import { RECEIPTS_BUCKET } from "../lib/receipts";
import { createAdminClient } from "../lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local (docs/setup.md).");
}

const bucket = createAdminClient(supabaseUrl, secretKey).storage.from(RECEIPTS_BUCKET);
const dir = join(process.cwd(), "backups", "receipts");

const files = await listReceiptFiles(bucket);
let downloaded = 0;
for (const path of files) {
  const target = join(dir, path);
  if (existsSync(target)) continue;
  const { data, error } = await bucket.download(path);
  if (error) throw new Error(`Couldn't download ${path}: ${error.message}`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, Buffer.from(await data.arrayBuffer()));
  downloaded++;
}
console.log(`${files.length} receipt file(s) in Storage; downloaded ${downloaded} new to ${dir}.`);
