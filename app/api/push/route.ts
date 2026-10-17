// "Send notifications to this phone" on or off (components/notifications-toggle.tsx;
// docs/features/notifications.md). Saves or removes this device's push subscription for the
// signed-in member only — the real login, never a preview's housemate. POST again on the same
// device just updates it (a phone someone else now signs in on moves to them). `live` records
// whether it was saved on the live site: one database, so localhost's never get real pushes.

import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, pushSubscriptions } from "@/db";
import { getViewer } from "@/lib/auth";
import { emailIsLive } from "@/lib/email";
import { parseEndpoint, parseSubscription } from "@/lib/push-subscription";

export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in first.", { status: 401 });

  const saved = parseSubscription(await request.json().catch(() => null));
  if (!saved) return new Response("Expected { subscription, platform } from a known push service.", { status: 400 });

  const values = { ...saved, memberId: viewer.memberId, live: emailIsLive() };
  await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
  return new Response(null, { status: 204 });
}

export async function DELETE(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in first.", { status: 401 });

  const endpoint = parseEndpoint(await request.json().catch(() => null));
  if (!endpoint) return new Response("Expected { endpoint }.", { status: 400 });

  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.memberId, viewer.memberId)));
  return new Response(null, { status: 204 });
}
