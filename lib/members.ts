// Member color dots (rose, violet, indigo, amber, emerald, then repeating), assigned from
// each member's sort_order so a person keeps the same color on every page and month.
// Class names are written out in full so Tailwind can find them.

const DOT_CLASSES = ["bg-rose-500", "bg-violet-500", "bg-indigo-500", "bg-amber-500", "bg-emerald-500"] as const;

/** A member's dot, from their sort_order (1-based). */
export function dotClassOf(member: { sortOrder: number }): string {
  const index = member.sortOrder - 1;
  return DOT_CLASSES[((index % DOT_CLASSES.length) + DOT_CLASSES.length) % DOT_CLASSES.length];
}
