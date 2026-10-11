// Opens a receipt (docs/features/receipts.md). The bucket is private: this checks the login,
// then redirects to a link to the file that works for one minute. The page links here rather
// than to Storage, so its links never go stale and every view passes the login check.

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, payments, receipts } from "@/db";
import { getViewer } from "@/lib/auth";
import { canSeePaymentProof } from "@/lib/permissions";
import { receiptStorage } from "@/lib/supabase/admin-server";

const LINK_SECONDS = 60;

export async function GET(_request: NextRequest, ctx: RouteContext<"/receipts/[id]">) {
  // Every signed-in household member can see bill proofs, like the rest of the month; a
  // payment's proof (a bank screenshot) only PA and the two people in it (lib/permissions.ts).
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in to see receipts.", { status: 401 });

  const { id } = await ctx.params;
  if (!/^[1-9]\d{0,8}$/.test(id)) return new Response("Receipt not found.", { status: 404 });
  const [receipt] = await db
    .select({ storagePath: receipts.storagePath, paymentFrom: payments.fromMemberId, paymentTo: payments.toMemberId })
    .from(receipts)
    .leftJoin(payments, eq(payments.id, receipts.paymentId))
    .where(eq(receipts.id, Number(id)))
    .limit(1);
  if (!receipt) return new Response("Receipt not found.", { status: 404 });
  // Someone else's payment proof: the same answer as a missing one, so it doesn't say it exists.
  if (
    receipt.paymentFrom !== null &&
    receipt.paymentTo !== null &&
    !canSeePaymentProof(viewer, { fromMemberId: receipt.paymentFrom, toMemberId: receipt.paymentTo })
  ) {
    return new Response("Receipt not found.", { status: 404 });
  }

  const { data, error } = await receiptStorage().createSignedUrl(receipt.storagePath, LINK_SECONDS);
  if (error || !data) {
    console.error("Couldn't sign a receipt link", error);
    return new Response("Couldn't open that receipt. Please try again.", { status: 502 });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: data.signedUrl,
      // This browser may reuse the redirect while the link still works; shared caches never.
      "Cache-Control": `private, max-age=${LINK_SECONDS - 10}`,
    },
  });
}
