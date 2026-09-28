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
