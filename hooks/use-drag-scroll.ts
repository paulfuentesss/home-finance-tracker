"use client";

import { useEffect, useRef } from "react";

// Drag the element sideways with the mouse to scroll it. Touch already scrolls natively,
// and drags that start on an input, button or link are left alone so editing still works.
// Sets data-scrollable (content is wider than the box) and data-dragging for styling.
const INTERACTIVE = "input, textarea, select, button, a, label, [role='combobox'], [contenteditable='true']";
const THRESHOLD = 4; // px of movement before a press counts as a drag rather than a click

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const drag = useRef<{ startX: number; scrollLeft: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      if (el.scrollWidth > el.clientWidth) el.dataset.scrollable = "true";
      else delete el.dataset.scrollable;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);

  const onPointerDown = (e: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as Element).closest(INTERACTIVE)) return;
    if (el.scrollWidth <= el.clientWidth) return; // nothing to scroll
    drag.current = { startX: e.clientX, scrollLeft: el.scrollLeft, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<T>) => {
    const el = ref.current;
    const d = drag.current;
    if (!el || !d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < THRESHOLD) return;
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
    drag.current = null;
    if (!el || !d?.moved) return;
    delete el.dataset.dragging;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    // Swallow the click that follows a drag so it doesn't land on whatever is under the mouse.
    const swallow = (ev: MouseEvent) => ev.stopPropagation();
    el.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 0);
  };

  return { ref, onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}
