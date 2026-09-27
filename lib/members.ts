// Member color dots (rose, violet, indigo, amber, emerald, then repeating), assigned from
// each member's sort_order so a person keeps the same color on every page and month.
// Class names are written out in full so Tailwind can find them.

const DOT_CLASSES = ["bg-rose-500", "bg-violet-500", "bg-indigo-500", "bg-amber-500", "bg-emerald-500"] as const;

export function memberDotClass(index: number): string {
  return DOT_CLASSES[((index % DOT_CLASSES.length) + DOT_CLASSES.length) % DOT_CLASSES.length];
}
