// Gives a household member a login (docs/features/auth.md) — the same thing as typing their
// email in Manage People. Used for PA's own login (there's no admin to invite him until then)
// and as the way back in if PA's login email is ever wrong.
//
//   npm run auth:invite -- PA you@example.com    # invite, or change the email
//   npm run auth:invite -- PA --remove           # take the login away
//
// Use the exact address Google shows (dots included) if they'll sign in with Google.

import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { members } from "../db/schema";
import { ActionError } from "../lib/errors";
import { inviteMember, uninviteMember } from "../lib/invites";
import { createAdminClient } from "../lib/supabase/admin";

const [name, email] = process.argv.slice(2);
if (!name || !email) {
  console.log("Usage: npm run auth:invite -- <member name> <email | --remove>");
  process.exit(1);
}
const url = process.env.DIRECT_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !supabaseUrl || !secretKey) {
  throw new Error("Set DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local (docs/setup.md).");
}

const { db, client } = createDb(url, { max: 1 });
const auth = createAdminClient(supabaseUrl, secretKey).auth.admin;

try {
  const member = await db.query.members.findFirst({ where: eq(members.name, name) });
  if (!member) throw new ActionError(`No member is called "${name}".`);
  if (email === "--remove") {
    await uninviteMember(db, auth, member.id);
    console.log(`${member.name} can no longer log in.`);
  } else {
    await inviteMember(db, auth, member.id, email);
    console.log(`${member.name} can now log in as ${email.trim().toLowerCase()} (Google or email code).`);
  }
} catch (error) {
  if (!(error instanceof ActionError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
