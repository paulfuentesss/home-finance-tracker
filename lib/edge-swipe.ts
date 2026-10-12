// Swipe in from the left edge to open the phone menu (docs/features/months.md). Pure: the touch
// listener in components/app-sidebar.tsx feeds it points, and it says when the swipe counts.
//
// Not Base UI's Drawer.SwipeArea: that's a strip that catches every touch on it, and Android's
// own Back gesture owns about the first 30 px of the edge, so a strip wide enough to reach would
// block taps on the page (docs/decisions.md). A swipe may start anywhere within EDGE_PX instead.

/** A touch position in CSS pixels from the viewport's top-left, at a time in ms. */
export type SwipePoint = { x: number; y: number; t: number };

export type EdgeSwipe =
  | { phase: "pending"; start: SwipePoint; moving: boolean }
  | { phase: "open" }
  | { phase: "ignore" };

/** A swipe must start this close to the left edge (past Android's Back zone, with room to spare). */
export const EDGE_PX = 64;
/** Movement below this is a finger settling, not a direction yet. */
export const SLOP_PX = 10;
/** How far right the finger must travel to open the menu. */
export const OPEN_PX = 60;
/** Held still longer than this first: a long press (selecting text), not a swipe. */
export const LONG_PRESS_MS = 500;

export const IGNORED: EdgeSwipe = { phase: "ignore" };

export function startEdgeSwipe(point: SwipePoint): EdgeSwipe {
  return point.x <= EDGE_PX ? { phase: "pending", start: point, moving: false } : IGNORED;
}

export function moveEdgeSwipe(swipe: EdgeSwipe, point: SwipePoint): EdgeSwipe {
  if (swipe.phase !== "pending") return swipe;
  const dx = point.x - swipe.start.x;
  const dy = point.y - swipe.start.y;
  if (!swipe.moving) {
    if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return swipe;
    // The first real movement decides: a late start, a scroll (mostly up/down) or a swipe left
    // is never the menu.
    if (point.t - swipe.start.t > LONG_PRESS_MS || dx <= 0 || Math.abs(dy) >= Math.abs(dx)) return IGNORED;
    swipe = { ...swipe, moving: true };
  }
  if (dx < OPEN_PX) return swipe;
  return dx > 2 * Math.abs(dy) ? { phase: "open" } : IGNORED;
}
