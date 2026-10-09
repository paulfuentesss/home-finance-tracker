// The data access layer's gate (docs/features/auth.md): who is signed in, and which household
// member that is. proxy.ts only redirects logged-out visitors as a convenience; every page read
// (lib/periods.ts) and every Server Action (run() in actions.ts) checks here.

import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, members } from "@/db";
import { dotClassOf } from "@/lib/members";
import { isAdmin, previewViewer, type Viewer } from "@/lib/permissions";
import { PREVIEW_COOKIE, parsePreviewCookie, type PreviewChoice } from "@/lib/preview";
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

/**
 * Everyone in the household now (one query per request, shared by the two preview helpers).
 * Awaited inside, so the cache holds the rows — a Drizzle query re-runs every time it's awaited.
 */
const activeMembers = cache(async () =>
  await db
    .select({
      memberId: members.id,
      name: members.name,
      role: members.role,
      email: members.email,
      active: members.active,
      sortOrder: members.sortOrder,
    })
    .from(members)
    .where(eq(members.active, true))
    .orderBy(asc(members.sortOrder), asc(members.id)),
);

/**
 * The housemate `viewer` is previewing as (lib/preview.ts), or null. Takes the viewer the
 * caller already has (run() does); the cookie is read only when that viewer is the admin, and a
 * stale or malformed one means no preview.
 */
export async function previewFor(viewer: Viewer): Promise<Viewer | null> {
  if (!isAdmin(viewer)) return null;
  const memberId = parsePreviewCookie((await cookies()).get(PREVIEW_COOKIE)?.value);
  if (memberId === null) return null;
  const target = (await activeMembers()).find((m) => m.memberId === memberId);
  return previewViewer(viewer, target ?? null);
}

/** The housemate the signed-in admin is previewing as, or null (see previewFor). */
export const getPreview = cache(async (): Promise<Viewer | null> => {
  const viewer = await getViewer();
  return viewer ? previewFor(viewer) : null;
});

/** Who the admin can preview as (the same rule as previewViewer); [] for everyone else. */
export const getPreviewChoices = cache(async (): Promise<PreviewChoice[]> => {
  const viewer = await getViewer();
  if (!viewer || !isAdmin(viewer)) return [];
  return (await activeMembers())
    .filter((m) => previewViewer(viewer, m) !== null)
    .map((m) => ({ id: m.memberId, name: m.name, dotClass: dotClassOf(m) }));
});
