// "This member is using My House, from the installed app or a browser, on this kind of device"
// (components/seen-tracker.tsx; docs/features/manage.md → Who's using it). Records the real login,
// never a preview's housemate, and only for the caller themselves. View-only logins count too.
// At most one write per row every 5 minutes, however often it's called.

import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, memberDevices } from "@/db";
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
  return new Response(null, { status: 204 });
}
