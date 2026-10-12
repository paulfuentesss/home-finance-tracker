// Member color dots (rose, violet, indigo, amber, emerald, then repeating), assigned from
// each member's sort_order so a person keeps the same color on every page and month.
// Class names are written out in full so Tailwind can find them.

import type { Role } from "@/lib/permissions";

const DOT_CLASSES = ["bg-rose-500", "bg-violet-500", "bg-indigo-500", "bg-amber-500", "bg-emerald-500"] as const;

/** A view-only login's dot: grey, like the header's fallback for someone who isn't in the month. */
export const VIEW_ONLY_DOT_CLASS = "bg-zinc-400";

/** A member's dot, from their sort_order (1-based). */
export function dotClassOf(member: { sortOrder: number }): string {
  const index = member.sortOrder - 1;
  return DOT_CLASSES[((index % DOT_CLASSES.length) + DOT_CLASSES.length) % DOT_CLASSES.length];
}

/**
 * A dot in household-wide lists (Manage, "Preview as…"): grey for a view-only login, who is in
 * no month. A month's own pages use dotClassOf, so a former housemate keeps their colour in
 * the months they shared.
 */
export function householdDotClassOf(member: { sortOrder: number; role: Role }): string {
  return sharesCosts(member) ? dotClassOf(member) : VIEW_ONLY_DOT_CLASS;
}

/**
 * Whether a member shares in the house costs, i.e. joins each month (a `period_balances` row).
 * A view-only login never does.
 */
export function sharesCosts(member: { role: Role }): boolean {
  return member.role !== "view_only";
}
