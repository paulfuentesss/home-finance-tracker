// Creates the private "receipts" Storage bucket, or brings its settings back in line
// (docs/features/receipts.md). Safe to run again.
// Run: npm run storage:setup

import { MAX_RECEIPT_BYTES, RECEIPT_TYPES, RECEIPTS_BUCKET } from "../lib/receipts";
import { createAdminClient } from "../lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local (docs/setup.md).");
}

const storage = createAdminClient(supabaseUrl, secretKey).storage;
// Private: files are only reachable through short-lived signed links the app makes after
// checking the login. Supabase also refuses other types and larger files (a second check).
const settings = {
  public: false,
  fileSizeLimit: MAX_RECEIPT_BYTES,
  allowedMimeTypes: Object.keys(RECEIPT_TYPES),
};

const { data: existing } = await storage.getBucket(RECEIPTS_BUCKET);
const { error } = existing
  ? await storage.updateBucket(RECEIPTS_BUCKET, settings)
  : await storage.createBucket(RECEIPTS_BUCKET, settings);
if (error) {
  console.error(`Couldn't set up the ${RECEIPTS_BUCKET} bucket: ${error.message}`);
  process.exit(1);
}
console.log(`${existing ? "Updated" : "Created"} the private "${RECEIPTS_BUCKET}" bucket.`);
