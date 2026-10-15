"use client";

import { useEffect, useRef } from "react";

// Drag the element sideways with the mouse to scroll it. Touch already scrolls natively,
// and drags that start on an input or button are left alone so editing still works. A link
// can start a drag (the Split Table's totals are links) instead of the browser dragging its
// URL, but needs more movement first, so a slightly shaky click still opens it.
// Sets data-scrollable (content is wider than the box), data-more-right (not scrolled to the
// end yet), data-scrolled-left (scrolled away from the start) and data-dragging for styling.
const INTERACTIVE = "input, textarea, select, button, label, [role='combobox'], [contenteditable='true']";
const THRESHOLD = 4; // px of movement before a press counts as a drag rather than a click
const LINK_THRESHOLD = 10; // the same, for a press on a link

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  // `pointerId`: the mouse that pressed; other pointers (a pen or finger on a touchscreen laptop)
  // never move or end its drag.
  const drag = useRef<{
    pointerId: number;
    startX: number;
    scrollLeft: number;
    threshold: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      if (el.scrollWidth > el.clientWidth) el.dataset.scrollable = "true";
      else delete el.dataset.scrollable;
      // 1px slack: scrollLeft can land a fraction short of the end on zoomed/retina screens.
      if (el.scrollLeft + el.clientWidth < el.scrollWidth - 1) el.dataset.moreRight = "true";
      else delete el.dataset.moreRight;
      if (el.scrollLeft > 0) el.dataset.scrolledLeft = "true";
      else delete el.dataset.scrolledLeft;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || e.button !== 0) return;
    // A new mouse press: one whose release we never saw doesn't carry over. (Not for a touch or
    // pen: on a touchscreen laptop that would cut off a mouse drag still under way.)
    if (drag.current?.moved) delete el.dataset.dragging;
    drag.current = null;
    const target = e.target as Element;
    // React passes events from portals (a popover, a dialog opened from the table) up to here;
    // only presses really inside the table drag it.
    if (!el.contains(target)) return;
    if (target.closest(INTERACTIVE)) return;
    if (el.scrollWidth <= el.clientWidth) return; // nothing to scroll
    const threshold = target.closest("a") ? LINK_THRESHOLD : THRESHOLD;
    drag.current = { pointerId: e.pointerId, startX: e.clientX, scrollLeft: el.scrollLeft, threshold, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<T>) => {
    const el = ref.current;
    const d = drag.current;
    if (!el || !d || e.pointerId !== d.pointerId) return;
    // The button was let go without a pointerup reaching us (outside the table, a window
    // switch): end the press as if it had, so hovering back doesn't scroll or keep "dragging".
    if (e.buttons === 0) {
      end(e);
      return;
    }
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < d.threshold) return;
    if (!d.moved) {
      d.moved = true;
      el.setPointerCapture(e.pointerId);
      el.dataset.dragging = "true";
      window.getSelection()?.removeAllRanges();
    }
    el.scrollLeft = d.scrollLeft - dx;
  };

  const end = (e: React.PointerEvent<T>) => {
    const el = ref.current;
    const d = drag.current;
    if (d && e.pointerId !== d.pointerId) return;
    drag.current = null;
    if (!el || !d?.moved) return;
    delete el.dataset.dragging;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    // Swallow the click that follows a drag so it doesn't land on whatever is under the mouse
    // (and a link under it isn't followed).
    const swallow = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    el.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 0);
  };

  // While a press can scroll, the browser doesn't drag a link's URL (or an image) instead, which
  // would cancel the scroll. Selected text, touch, and a table that fits drag as usual.
  const onDragStart = (e: React.DragEvent<T>) => {
    // A text drag's target is the text itself (not an Element), so check before closest().
    const onLinkOrImage = e.target instanceof Element && e.target.closest("a, img") !== null;
    if (drag.current && onLinkOrImage) e.preventDefault();
  };

  return { ref, onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onDragStart };
}
