// Sends My House's push notifications (docs/features/notifications.md) to the phones and browsers
// that turned them on (push_subscriptions). Signs each with the VAPID private key
// (VAPID_PRIVATE_KEY — only this file reads it); Google's or Apple's push service delivers it, and
// public/sw.js shows it. The words are in lib/push-messages.ts.
//
// A push is an extra: it never throws, never holds anything up for long, and with the keys unset
// it does nothing at all. Emails, actions and the daily job work the same with or without it.
//
// Safety switch, like lib/email.ts: localhost and the live site share one database. Only the live
// site pushes, and only to subscriptions saved on the live site. Anywhere else a push is only
// logged — or, with PUSH_TEST=on, sent to the admin's own devices as "[test → Ben] …".

import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import webpush, { WebPushError } from "web-push";
import { db, members, pushSubscriptions, type PushSubscriptionRow } from "@/db";
import { emailIsLive } from "@/lib/email";
import { testPush, type Push } from "@/lib/push-messages";

/** A slow push service mustn't hold up the daily job or a save. */
const TIMEOUT_MS = 5000;
/** Kept by the push service while the phone is off, then dropped: a day-old nudge is stale. */
const TTL_SECONDS = 24 * 60 * 60;
/**
 * Delivered at once, even to an idle, locked phone (Android otherwise batches "normal" ones, so an
 * "I paid" could arrive minutes late). Only a few a month, so the battery cost is nothing.
 */
const URGENCY = "high";

type Recipient = { id: number; name: string };
type Keys = { subject: string; publicKey: string; privateKey: string };

let warnedNoKeys = false;

/** The VAPID keys, or null while they aren't set (push is then off). */
function vapidKeys(): Keys | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    if (!warnedNoKeys) console.info("[push off: NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY unset]");
    warnedNoKeys = true;
    return null;
  }
  // Who to contact about these pushes, required by the push services: the household Gmail.
  const contact = process.env.GMAIL_SMTP_USER;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const subject = contact ? `mailto:${contact}` : host ? `https://${host}` : "mailto:noreply@example.com";
  return { subject, publicKey, privateKey };
}

/** Sends `push` to each recipient's phones and browsers. Never throws. */
export async function sendPush(to: readonly Recipient[], push: Push): Promise<void> {
  try {
    const keys = vapidKeys();
    if (!keys || to.length === 0) return;
    if (emailIsLive()) {
      const rows = await db
        .select()
        .from(pushSubscriptions)
        .where(and(inArray(pushSubscriptions.memberId, to.map((r) => r.id)), eq(pushSubscriptions.live, true)));
      await Promise.all(rows.map((row) => deliver(row, push, keys)));
      return;
    }
    if (process.env.PUSH_TEST !== "on") {
      console.info(`[push not sent: not the live site, PUSH_TEST is off] to ${to.map((r) => r.name).join(", ")}: ${push.title}`);
      return;
    }
    const admin = await adminOf();
    if (!admin) return;
    const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.memberId, admin.id));
    for (const recipient of to) await Promise.all(rows.map((row) => deliver(row, testPush(push, recipient.name), keys)));
  } catch (error) {
    console.error(`Couldn't send the push "${push.title}"`, error);
  }
}

/** Sends `push` to the admin (the collector, like the admin's emails). Never throws. */
export async function pushToAdmin(push: Push): Promise<void> {
  try {
    const admin = await adminOf();
    if (admin) await sendPush([admin], push);
  } catch (error) {
    console.error(`Couldn't send the push "${push.title}"`, error);
  }
}

async function adminOf(): Promise<Recipient | null> {
  const [admin] = await db
    .select({ id: members.id, name: members.name })
    .from(members)
    .where(eq(members.isCollector, true))
    .limit(1);
  return admin ?? null;
}

async function deliver(row: PushSubscriptionRow, push: Push, keys: Keys): Promise<void> {
  try {
    await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(push), {
      vapidDetails: keys,
      TTL: TTL_SECONDS,
      urgency: URGENCY,
      timeout: TIMEOUT_MS,
    });
  } catch (error) {
    // Gone: the app was removed, or notifications turned off. The phone re-saves it if it comes back.
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id));
      return;
    }
    console.warn(`Couldn't push to subscription ${row.id}`, error instanceof WebPushError ? error.statusCode : error);
  }
}
