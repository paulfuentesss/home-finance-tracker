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

// Member emoji (docs/features/manage.md → Emoji): shown in place of the dot when someone has one.

/** Longest emoji kept, in UTF-16 units: a family with skin tones is 19. `members_emoji_length` matches. */
export const MAX_EMOJI_LENGTH = 32;

/**
 * What was typed into an emoji field: exactly one emoji (skin tones, families, flags and keycaps
 * count as one), or empty for "no emoji" (the dot comes back). Anything else — text, or more
 * than one emoji — isn't ok.
 */
export function parseEmoji(raw: string): { ok: true; emoji: string | null } | { ok: false } {
  const value = raw.trim();
  if (value === "") return { ok: true, emoji: null };
  // Made here, not at load: this file is also loaded in the browser, which never calls this.
  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const single = [...graphemes.segment(value)].length === 1;
  // Keycaps (1️⃣, #️⃣) are a digit, # or * plus the keycap mark U+20E3, so the mark alone or on a
  // letter isn't one. ©, ® and ™ count as pictographic but are plain text unless they carry the
  // emoji variation selector (©️), so the bare ones aren't either.
  const keycap = /^[0-9#*]️?⃣$/u.test(value);
  const pictographic =
    /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value) && !/^[©®™]$/u.test(value);
  const emoji = keycap || pictographic;
  return single && emoji && value.length <= MAX_EMOJI_LENGTH ? { ok: true, emoji: value } : { ok: false };
}

/**
 * Whether a member shares in the house costs, i.e. joins each month (a `period_balances` row).
 * A view-only login never does.
 */
export function sharesCosts(member: { role: Role }): boolean {
  return member.role !== "view_only";
}
