// Who can log in (docs/features/auth.md). Sign-ups are off in Supabase, so a login exists only
// because PA invited that email: inviting creates the Supabase Auth user and stores its id on
// the member (`auth_user_id`), which every request matches on.
//
// Used by the `updateMemberEmail` action and by `npm run auth:invite`, so it takes the database
// and the Supabase admin API as parameters and never imports "@/db".
//
// Postgres and Supabase Auth can't share a transaction, so the order matters: each database
// write is one auto-committed statement, and Supabase is called before it or after it has
// returned. A failure can then leave, at worst, a stray login that matches no member (harmless:
// lib/auth.ts finds nobody for it) — never a member pointing at a deleted login.

import { and, eq, ne, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { members } from "@/db/schema";
import { ActionError, isUniqueViolation } from "@/lib/errors";
import type { AuthAdmin } from "@/lib/supabase/admin";

/** Gives a member a login for `email` (lowercased), replacing any login they had. */
export async function inviteMember(db: Database, auth: AuthAdmin, memberId: number, rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const member = await db.query.members.findFirst({ where: eq(members.id, memberId) });
  if (!member || !member.active) throw new ActionError("That person was removed.");
  // Same address (maybe typed in different letter case): keep the login and its Google link.
  if (member.email === email && member.authUserId) return;
  const other = await db.query.members.findFirst({ where: and(eq(members.email, email), ne(members.id, memberId)) });
  if (other) throw new ActionError(`That email is already used by ${other.name}.`);

  const newLogin = await createLogin(db, auth, email);

  let oldLogin: string | null;
  try {
    // The old login id is read in a locked CTE: a plain UPDATE … RETURNING gives the *new*
    // values. `and active` makes this the "not removed" check too, with no race.
    const rows = await db.execute<{ auth_user_id: string | null }>(sql`
      with old as (select id, auth_user_id from members where id = ${memberId} and active for update)
      update members m set email = ${email}, auth_user_id = ${newLogin}
      from old where m.id = old.id
      returning old.auth_user_id`);
    if (rows.length === 0) throw new ActionError("That person was removed.");
    oldLogin = rows[0].auth_user_id;
  } catch (error) {
    await deleteLogin(auth, newLogin);
    if (isUniqueViolation(error, "members_email_unique")) throw new ActionError("That email is already used by someone else.");
    throw error;
  }
  if (oldLogin && oldLogin !== newLogin) await deleteLogin(auth, oldLogin);
}

/** Takes a member's login away (their email is cleared too). */
export async function uninviteMember(db: Database, auth: AuthAdmin, memberId: number): Promise<void> {
  const rows = await db.execute<{ auth_user_id: string | null }>(sql`
    with old as (select id, auth_user_id from members where id = ${memberId} for update)
    update members m set email = null, auth_user_id = null
    from old where m.id = old.id
    returning old.auth_user_id`);
  const oldLogin = rows[0]?.auth_user_id;
  if (oldLogin) await deleteLogin(auth, oldLogin);
}

/** Creates a confirmed Supabase user for `email` and returns its id. */
async function createLogin(db: Database, auth: AuthAdmin, email: string): Promise<string> {
  const created = await auth.createUser({ email, email_confirm: true });
  if (!created.error) return created.data.user.id;
  if (created.error.code !== "email_exists") {
    throw new ActionError(`Supabase couldn't create that login: ${created.error.message}`);
  }
  // A leftover login with this email (e.g. from someone removed earlier). Never reused — it
  // might carry a password its owner set — so it's deleted and made again.
  const { data, error } = await auth.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new ActionError(`Supabase couldn't list logins: ${error.message}`);
  const leftover = data.users.find((u) => u.email?.toLowerCase() === email);
  if (!leftover) throw new ActionError("Supabase says that email has a login, but it can't be found. Try again.");
  const linked = await db.query.members.findFirst({ where: eq(members.authUserId, leftover.id) });
  if (linked) throw new ActionError(`That email's login belongs to ${linked.name}.`);
  const removed = await auth.deleteUser(leftover.id);
  if (removed.error) throw new ActionError(`Supabase couldn't replace the old login: ${removed.error.message}`);
  const again = await auth.createUser({ email, email_confirm: true });
  if (again.error) throw new ActionError(`Supabase couldn't create that login: ${again.error.message}`);
  return again.data.user.id;
}

/** Best effort: a login that matches no member can't see anything, so a failure is only logged. */
async function deleteLogin(auth: AuthAdmin, authUserId: string): Promise<void> {
  try {
    const { error } = await auth.deleteUser(authUserId);
    if (error) console.error(`Couldn't delete login ${authUserId}`, error);
  } catch (error) {
    console.error(`Couldn't delete login ${authUserId}`, error);
  }
}
