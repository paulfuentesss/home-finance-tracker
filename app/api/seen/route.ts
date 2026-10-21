// "This member is using My House, from the installed app or a browser, on this kind of device"
// (components/seen-tracker.tsx; docs/features/manage.md → Who's using it). Records the real login,
// never a preview's housemate, and only for the caller themselves. View-only logins count too.
// At most one write per row every 5 minutes, however often it's called.
// From a month page (BillSeen, with `drawnAt`), it also marks the caller's own bill emails sent
// before that page was drawn as seen (docs/features/reminders.md).

import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, memberDevices, reminderSends } from "@/db";
import { getViewer } from "@/lib/auth";
import { parseSeen } from "@/lib/devices";

export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in first.", { status: 401 });

  const seen = parseSeen(await request.json().catch(() => null));
  if (!seen) return new Response("Expected { via, platform }.", { status: 400 });

  await db
    .insert(memberDevices)
    .values({ memberId: viewer.memberId, via: seen.via, platform: seen.platform })
    .onConflictDoUpdate({
      target: [memberDevices.memberId, memberDevices.via, memberDevices.platform],
      set: { lastSeenAt: sql`now()` },
      setWhere: sql`${memberDevices.lastSeenAt} < now() - interval '5 minutes'`,
    });
  if (seen.drawnAt) {
    // Only the first look after each send: a resend moves sent_at past seen_at, so it's marked again.
    await db
      .update(reminderSends)
      .set({ seenAt: sql`now()` })
      .where(
        and(
          eq(reminderSends.memberId, viewer.memberId),
          inArray(reminderSends.kind, ["payables", "bills_in"]),
          lte(reminderSends.sentAt, seen.drawnAt),
          or(isNull(reminderSends.seenAt), lt(reminderSends.seenAt, reminderSends.sentAt)),
        ),
      );
  }
  return new Response(null, { status: 204 });
}
