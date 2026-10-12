import { describe, expect, it } from "vitest";
import { IGNORED, moveEdgeSwipe, startEdgeSwipe, type EdgeSwipe, type SwipePoint } from "./edge-swipe";

/** Starts a swipe at `start`, then feeds each move in order. */
function swipe(start: SwipePoint, ...moves: SwipePoint[]): EdgeSwipe {
  return moves.reduce(moveEdgeSwipe, startEdgeSwipe(start));
}

describe("startEdgeSwipe", () => {
  it("counts a touch within 64 px of the left edge", () => {
    expect(startEdgeSwipe({ x: 64, y: 300, t: 0 }).phase).toBe("pending");
    expect(startEdgeSwipe({ x: 35, y: 300, t: 0 }).phase).toBe("pending");
  });

  it("ignores a touch further in", () => {
    expect(startEdgeSwipe({ x: 65, y: 300, t: 0 })).toEqual(IGNORED);
  });
});

describe("moveEdgeSwipe", () => {
  const start = { x: 40, y: 300, t: 0 };

  it("opens once the finger has travelled 60 px right", () => {
    expect(swipe(start, { x: 55, y: 302, t: 50 }, { x: 99, y: 305, t: 100 }).phase).toBe("pending");
    expect(swipe(start, { x: 55, y: 302, t: 50 }, { x: 100, y: 305, t: 100 })).toEqual({ phase: "open" });
  });

  it("waits while the finger is still settling (under 10 px either way)", () => {
    expect(swipe(start, { x: 49, y: 309, t: 50 }).phase).toBe("pending");
  });

  it("ignores a scroll: the first real movement is mostly up or down", () => {
    expect(swipe(start, { x: 52, y: 288, t: 50 })).toEqual(IGNORED);
    // A tie counts as a scroll.
    expect(swipe(start, { x: 52, y: 312, t: 50 })).toEqual(IGNORED);
  });

  it("ignores a swipe to the left", () => {
    expect(swipe(start, { x: 28, y: 300, t: 50 })).toEqual(IGNORED);
  });

  it("ignores a long press: held still over 500 ms before moving", () => {
    expect(swipe(start, { x: 55, y: 300, t: 501 })).toEqual(IGNORED);
    expect(swipe(start, { x: 55, y: 300, t: 500 }, { x: 100, y: 300, t: 600 })).toEqual({ phase: "open" });
  });

  it("lets a slow swipe open once it's moving, however long it takes", () => {
    expect(swipe(start, { x: 55, y: 300, t: 100 }, { x: 100, y: 300, t: 2000 })).toEqual({ phase: "open" });
  });

  it("ignores a swipe that drifted diagonally by the time it got far enough", () => {
    // 60 right needs under 30 up or down: 30 is too much.
    expect(swipe(start, { x: 55, y: 305, t: 50 }, { x: 100, y: 330, t: 100 })).toEqual(IGNORED);
    expect(swipe(start, { x: 55, y: 305, t: 50 }, { x: 100, y: 329, t: 100 })).toEqual({ phase: "open" });
  });

  it("stays decided", () => {
    expect(moveEdgeSwipe(IGNORED, { x: 200, y: 300, t: 50 })).toEqual(IGNORED);
    expect(moveEdgeSwipe({ phase: "open" }, { x: 0, y: 0, t: 50 })).toEqual({ phase: "open" });
  });
});
