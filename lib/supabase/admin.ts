// A Supabase client with the secret key, for creating and deleting invited logins
// (lib/invites.ts) and for the private receipts bucket. It holds no secret itself, so scripts
// can use it; the app gets it only through admin-server.ts, which is server-only. Never import
// this from a Client Component.

import { createClient } from "@supabase/supabase-js";

export function createAdminClient(url: string, secretKey: string) {
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** The part of the admin API that lib/invites.ts uses (small, so tests can fake it). */
export type AuthAdmin = Pick<
  ReturnType<typeof createAdminClient>["auth"]["admin"],
  "createUser" | "deleteUser" | "listUsers"
>;
