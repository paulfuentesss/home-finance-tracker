// Who may do what (docs/features/auth.md). Pure — no DB access — and covered by tests.
// The server enforces these in lib/auth.ts and run() (actions.ts); the UI uses them only to
// hide buttons that wouldn't work.

export type Role = "admin" | "member";

/** The signed-in household member. */
export interface Viewer {
  memberId: number;
  name: string;
  role: Role;
  /** Their own login email, shown in the account menu (never anyone else's). */
  email: string | null;
}

export function isAdmin(viewer: Viewer): boolean {
  return viewer.role === "admin";
}

/**
 * Whether the viewer may edit or delete an advance. The admin can change any; a member only
 * advances they paid that are still in the month's default ("Advances Shared") column — once
 * the admin moves one elsewhere, it's the admin's.
 */
export function canManageAdvance(viewer: Viewer, advance: { payerId: number; inDefaultColumn: boolean }): boolean {
  return isAdmin(viewer) || (advance.payerId === viewer.memberId && advance.inDefaultColumn);
}

/**
 * Who the admin is previewing as ("Preview as…" in the account menu), shaped like that
 * housemate's own login, or null for no preview. Only the admin may preview, and only an active
 * member who isn't an admin. The preview changes what's shown, never what's allowed: the server
 * refuses every change while it's on (run() in actions.ts).
 */
export function previewViewer(
  real: Viewer,
  target: { memberId: number; name: string; role: Role; email: string | null; active: boolean } | null,
): Viewer | null {
  if (!isAdmin(real) || !target || !target.active || target.role !== "member") return null;
  if (target.memberId === real.memberId) return null;
  return { memberId: target.memberId, name: target.name, role: "member", email: target.email };
}

/**
 * Where to send someone after signing in: a path on this site, or "/". Blocks open redirects
 * such as "//evil.com", "/\evil.com", "/.//evil.com" (which normalizes to "//evil.com") and
 * "@evil.com" (which would turn `${origin}${path}` into a login to evil.com). Returns the
 * normalized path, never the raw input; callers redirect to `${origin}${path}`.
 */
export function safeNext(next: unknown, origin: string): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  let url: URL;
  try {
    url = new URL(next, origin);
  } catch {
    return "/";
  }
  if (url.origin !== new URL(origin).origin || url.pathname.startsWith("//")) return "/";
  return url.pathname + url.search + url.hash;
}
