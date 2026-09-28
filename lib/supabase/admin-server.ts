// The app's only reader of SUPABASE_SECRET_KEY. Server-only: importing this from a Client
// Component fails the build.

import "server-only";
import { createAdminClient, type AuthAdmin } from "./admin";
import { supabaseEnv } from "./env";

export function authAdmin(): AuthAdmin {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is not set — add it to .env.local (docs/setup.md).");
  return createAdminClient(supabaseEnv().url, secretKey).auth.admin;
}
