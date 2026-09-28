// The data access layer's gate (docs/features/auth.md): who is signed in, and which household
// member that is. proxy.ts only redirects logged-out visitors as a convenience; every page read
// (lib/periods.ts) and every Server Action (run() in actions.ts) checks here.

import "server-only";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, members } from "@/db";
import type { Viewer } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The signed-in member, or null. Matches the login's user id (`sub`, from a verified token) to
 * an active member's `auth_user_id` — never the email claim. The role is read from the
 * database on every request, so removing or demoting someone takes effect at once.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const authUserId = data?.claims.sub;
  return authUserId ? memberForLogin(authUserId) : null;
});

/** The active member linked to a Supabase login, or null (not invited, or removed). */
export async function memberForLogin(authUserId: string): Promise<Viewer | null> {
  const [member] = await db
    .select({ memberId: members.id, name: members.name, role: members.role, email: members.email })
    .from(members)
    .where(and(eq(members.authUserId, authUserId), eq(members.active, true)))
    .limit(1);
  return member ?? null;
}

/** The signed-in member; anyone else goes to the login page. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}
