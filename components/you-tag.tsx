"use client";

import { useViewer } from "@/components/viewer-context";

/**
 * "You" beside the name of whoever the page is drawn for (the signed-in member, or the housemate
 * PA is previewing as), so people find their own row at a glance. Nothing for anyone else.
 */
export function YouTag({ memberId }: { memberId: number }) {
  const viewer = useViewer();
  if (viewer.memberId !== memberId) return null;
  return (
    <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold tracking-wide text-amber-800 uppercase">
      You
    </span>
  );
}
