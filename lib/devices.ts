// Who's using My House, and from where (docs/features/manage.md → Who's using it). The page
// reports "installed app or browser" and a coarse device type (components/seen-tracker.tsx →
// app/api/seen/route.ts); Manage shows it to the admin. Only the browser can tell either: the
// server can't see `display-mode`, and an iPad's request says it's a Mac.
// Pure except isInstalledApp, which reads the browser.

import { dateInManila, dateLabel, dayLabel, daysBetween } from "@/lib/format";

export const DEVICE_VIAS = ["app", "web"] as const;
export const DEVICE_PLATFORMS = ["iphone", "ipad", "android", "mac", "windows", "other"] as const;

export type DeviceVia = (typeof DEVICE_VIAS)[number];
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<DevicePlatform, string> = {
  iphone: "iPhone",
  ipad: "iPad",
  android: "Android",
  mac: "Mac",
  windows: "Windows",
  other: "another device",
};

/** The device type from the browser's user agent. iPadOS says it's a Mac; touch gives it away. */
export function platformOf(userAgent: string, maxTouchPoints: number): DevicePlatform {
  if (/iPhone|iPod/.test(userAgent)) return "iphone"; // before Mac: iPhones say "like Mac OS X"
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "ipad";
  if (/Android/.test(userAgent)) return "android";
  if (/Macintosh|Mac OS X/.test(userAgent)) return "mac";
  if (/Windows/.test(userAgent)) return "windows";
  return "other";
}

/** Opened from the home screen / as an installed app, rather than in a browser tab. */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone; // iPhone/iPad
  return Boolean(standalone) || window.matchMedia("(display-mode: standalone)").matches;
}

/**
 * What /api/seen accepts; anything else is refused. `drawnAt` (from a month page, BillSeen): when
 * the server drew that page, so only emails sent before it count as seen — null when it's
 * missing or not a time.
 */
export function parseSeen(body: unknown): { via: DeviceVia; platform: DevicePlatform; drawnAt: Date | null } | null {
  if (typeof body !== "object" || body === null) return null;
  const { via, platform, drawnAt } = body as Record<string, unknown>;
  if (!DEVICE_VIAS.includes(via as DeviceVia) || !DEVICE_PLATFORMS.includes(platform as DevicePlatform)) return null;
  const drawn = typeof drawnAt === "number" ? new Date(drawnAt) : null;
  return {
    via: via as DeviceVia,
    platform: platform as DevicePlatform,
    drawnAt: drawn && Number.isFinite(drawn.getTime()) ? drawn : null,
  };
}

export interface DeviceRow {
  memberId: number;
  via: DeviceVia;
  platform: DevicePlatform;
  lastSeenAt: Date;
}

/** "App on iPhone", "Web on Mac". */
export function deviceLabel(row: Pick<DeviceRow, "via" | "platform">): string {
  return `${row.via === "app" ? "App" : "Web"} on ${PLATFORM_LABELS[row.platform]}`;
}

/**
 * How long ago, as the admin reads it on Manage: "just now", "5 min ago", "3 h ago" (same Manila
 * day), "yesterday", "3 days ago" (within a week), then the date ("Oct. 3", or "Oct. 3, 2025").
 */
export function seenLabel(moment: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - moment.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const day = dateInManila(moment);
  const today = dateInManila(now);
  const days = daysBetween(day, today);
  if (days <= 0) return `${Math.floor(minutes / 60)} h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return day.slice(0, 4) === today.slice(0, 4) ? dayLabel(day) : dateLabel(day);
}

export interface MemberActivity {
  /** The most recent device. */
  lastSeen: DeviceRow;
  /** They've opened the installed app at least once. */
  installed: boolean;
  /** Every device, most recent first. */
  devices: DeviceRow[];
}

/** Each member's activity, from their device rows. Members with no rows aren't in the map. */
export function summarizeDevices(rows: DeviceRow[]): Map<number, MemberActivity> {
  const byMember = new Map<number, DeviceRow[]>();
  for (const row of rows) byMember.set(row.memberId, [...(byMember.get(row.memberId) ?? []), row]);
  const summary = new Map<number, MemberActivity>();
  for (const [memberId, list] of byMember) {
    const devices = [...list].sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
    summary.set(memberId, { lastSeen: devices[0], installed: devices.some((d) => d.via === "app"), devices });
  }
  return summary;
}
