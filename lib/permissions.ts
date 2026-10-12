// Who may do what (docs/features/auth.md). Pure — no DB access — and covered by tests.
// The server enforces these in lib/auth.ts and run() (actions.ts); the UI uses them only to
// hide buttons that wouldn't work.

import type { Party } from "@/lib/settlement";

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
 * Whether the viewer may edit or delete a Helper entry (docs/features/helper.md). The admin can
 * change any; a member only a visit or early pay they paid. The debt carried over from the
 * sheet (`opening`) is the admin's.
 */
export function canManageHelperEntry(
  viewer: Viewer,
  entry: { kind: "visit" | "early_pay" | "opening"; payerId: number | null },
): boolean {
  return isAdmin(viewer) || (entry.kind !== "opening" && entry.payerId === viewer.memberId);
}

export type PaymentStatus = "confirmed" | "pending" | "rejected";

/**
 * Whether the viewer may send an "I paid" (docs/features/settle-up.md): any member but the
 * collector — the payment always goes into the House Budget, which the collector checks, and the
 * server sets both sides.
 */
export function canSubmitPayment(viewer: Viewer, collectorId: number | null): boolean {
  return collectorId !== null && viewer.memberId !== collectorId;
}

/**
 * Whether the viewer may cancel (delete) a payment. The admin can delete any; a member only
 * their own "I paid" while it's waiting or rejected — once confirmed, it's the admin's.
 */
export function canCancelPayment(viewer: Viewer, payment: { fromMemberId: Party; status: PaymentStatus }): boolean {
  return isAdmin(viewer) || (payment.fromMemberId === viewer.memberId && payment.status !== "confirmed");
}

/**
 * Whether the viewer may see a payment's proof. A bank-transfer screenshot can show someone's
 * bank and balance, so only the admin and the people in the payment see it (the House Budget
 * side is the admin's); everyone still sees the payment and its amount. (Bill proofs are for
 * everyone.)
 */
export function canSeePaymentProof(viewer: Viewer, payment: { fromMemberId: Party; toMemberId: Party }): boolean {
  return isAdmin(viewer) || payment.fromMemberId === viewer.memberId || payment.toMemberId === viewer.memberId;
}

/**
 * Whether the viewer may open a receipt: a bill's proof, anyone; a payment's, canSeePaymentProof.
 * `payment` is null only for a bill's receipt — callers decide that from `receipts.payment_id`,
 * never from the payment's sides (a House Budget side is NULL too).
 */
export function canOpenReceipt(
  viewer: Viewer,
  receipt: { payment: { fromMemberId: Party; toMemberId: Party } | null },
): boolean {
  return receipt.payment === null || canSeePaymentProof(viewer, receipt.payment);
}

/**
 * Whether the viewer may see a line on the Billers tab (docs/features/billers.md), passwords
 * included: the admin sees all of them, housemates the ones shared with them.
 */
export function canSeeBillerField(viewer: Viewer, field: { housematesCanSee: boolean }): boolean {
  return isAdmin(viewer) || field.housematesCanSee;
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
