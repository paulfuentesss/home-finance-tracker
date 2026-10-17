// What a phone sends when notifications are turned on (docs/features/notifications.md): the
// browser's push subscription — the push service's address for that device, and the keys that
// encrypt what's sent to it — plus the coarse device type. Checked by app/api/push/route.ts.
// Pure.

import { DEVICE_PLATFORMS, type DevicePlatform } from "@/lib/devices";

/**
 * The push services browsers use: Google's (Chrome, Edge on Android, Samsung), Apple's (Safari,
 * the iPhone home-screen app), Mozilla's and Microsoft's. Only these are saved, so a made-up
 * "subscription" can't make the server send requests anywhere else.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

export function isPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((host) => host.test(url.hostname));
}

export interface SavedSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  platform: DevicePlatform;
}

/** The base64url keys a browser gives (an encryption key ~87 chars, an auth secret ~22). */
const KEY = /^[A-Za-z0-9_-]+={0,2}$/;

/**
 * What POST /api/push accepts: `{ subscription: PushSubscription.toJSON(), platform }`. Anything
 * else, or an endpoint that isn't a known push service, is refused.
 */
export function parseSubscription(body: unknown): SavedSubscription | null {
  if (typeof body !== "object" || body === null) return null;
  const { subscription, platform } = body as Record<string, unknown>;
  if (typeof subscription !== "object" || subscription === null) return null;
  const { endpoint, keys } = subscription as Record<string, unknown>;
  if (typeof endpoint !== "string" || endpoint.length > 1000 || !isPushEndpoint(endpoint)) return null;
  if (typeof keys !== "object" || keys === null) return null;
  const { p256dh, auth } = keys as Record<string, unknown>;
  const key = (value: unknown, max: number) => typeof value === "string" && value.length <= max && KEY.test(value);
  if (!key(p256dh, 200) || !key(auth, 100)) return null;
  if (!DEVICE_PLATFORMS.includes(platform as DevicePlatform)) return null;
  return { endpoint, p256dh: p256dh as string, auth: auth as string, platform: platform as DevicePlatform };
}

/** What DELETE /api/push accepts: `{ endpoint }`. */
export function parseEndpoint(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const { endpoint } = body as Record<string, unknown>;
  return typeof endpoint === "string" && endpoint.length <= 1000 && isPushEndpoint(endpoint) ? endpoint : null;
}
