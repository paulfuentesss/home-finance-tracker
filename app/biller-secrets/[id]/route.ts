// Reveals one biller password (docs/features/billers.md). The Billers tab never carries
// passwords; its Reveal button asks here, one at a time, so every look passes the login and
// "shared with housemates" checks, and the value is never kept in a cache.

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { billerFields, db } from "@/db";
import { getViewer } from "@/lib/auth";
import { decryptSecret } from "@/lib/biller-secrets";
import { canSeeBillerField } from "@/lib/permissions";

const NOT_FOUND = () => new Response("Password not found.", { status: 404 });

export async function GET(_request: NextRequest, ctx: RouteContext<"/biller-secrets/[id]">) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in to see passwords.", { status: 401 });

  const { id } = await ctx.params;
  if (!/^[1-9]\d{0,8}$/.test(id)) return NOT_FOUND();
  const [field] = await db
    .select({ kind: billerFields.kind, secretValue: billerFields.secretValue, housematesCanSee: billerFields.housematesCanSee })
    .from(billerFields)
    .where(eq(billerFields.id, Number(id)))
    .limit(1);
  // One not shared with this viewer gets the same answer as a missing one, so it doesn't say it exists.
  if (!field || field.kind !== "secret" || field.secretValue === null) return NOT_FOUND();
  if (!canSeeBillerField(viewer, field)) return NOT_FOUND();

  let value: string;
  try {
    value = decryptSecret(field.secretValue);
  } catch (error) {
    // The message names the key problem, never the password.
    console.error(`Couldn't unlock biller password ${id}:`, error instanceof Error ? error.message : error);
    return new Response("Couldn't unlock this password.", { status: 500 });
  }
  return Response.json({ value }, { headers: { "Cache-Control": "no-store" } });
}
