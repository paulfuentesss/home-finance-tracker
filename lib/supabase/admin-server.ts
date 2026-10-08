// The app's only reader of SUPABASE_SECRET_KEY. Server-only: importing this from a Client
// Component fails the build.

import "server-only";
import { RECEIPTS_BUCKET } from "@/lib/receipts";
import { createAdminClient, type AuthAdmin } from "./admin";
import { supabaseEnv } from "./env";

function adminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is not set — add it to .env.local (docs/setup.md).");
  return createAdminClient(supabaseEnv().url, secretKey);
}

export function authAdmin(): AuthAdmin {
  return adminClient().auth.admin;
}

/**
 * The private receipts bucket (docs/features/receipts.md). The secret key bypasses Storage
 * policies, so callers check who's asking first (run() in actions.ts, the /receipts route).
 */
export function receiptStorage() {
  return adminClient().storage.from(RECEIPTS_BUCKET);
}
