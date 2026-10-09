"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useTransition } from "react";
import { isAdmin, type Viewer } from "@/lib/permissions";
import { onPreviewChangedElsewhere, startPreview, stopPreview } from "@/lib/preview-browser";

// Who's signed in, for showing or hiding controls. Only a hint for the UI: every page read and
// Server Action checks the viewer again on the server (lib/auth.ts, run()).

// While PA previews as a housemate (lib/preview.ts), `viewer` is that housemate, so every tab
// draws itself as they'd see it, and `previewBy` is PA.

const ViewerContext = createContext<{ viewer: Viewer; previewBy: Viewer | null } | null>(null);

export function ViewerProvider({
  viewer,
  previewBy,
  children,
}: {
  viewer: Viewer;
  previewBy: Viewer | null;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ viewer, previewBy }), [viewer, previewBy]);
  const router = useRouter();
  // A preview started or ended in another tab: redraw, so this tab never shows the wrong view.
  useEffect(() => onPreviewChangedElsewhere(() => router.refresh()), [router]);
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

function useViewerContext() {
  const value = useContext(ViewerContext);
  if (!value) throw new Error("useViewer() needs a <ViewerProvider> (the month layout provides one).");
  return value;
}

/** Who the page is drawn for: the signed-in member, or the housemate PA is previewing as. */
export function useViewer(): Viewer {
  return useViewerContext().viewer;
}

/** The admin while they preview as a housemate, otherwise null. */
export function usePreviewBy(): Viewer | null {
  return useViewerContext().previewBy;
}

/**
 * Whether this page is drawn as a preview, so its saves turn off: the server refuses them while
 * the preview is on, and once it has ended (in another tab) they would save as PA. A page drawn
 * as PA while a preview starts elsewhere redraws itself (ViewerProvider), and the server refuses
 * its saves meanwhile. False outside a month.
 */
export function useIsPreviewing(): boolean {
  return useContext(ViewerContext)?.previewBy != null;
}

/**
 * Starts (a member id) or ends (null) a preview, then redraws the page from the server.
 * `pending` stays true until the redrawn page arrives.
 */
export function usePreviewSwitch(): { pending: boolean; switchTo: (memberId: number | null) => void } {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const switchTo = (memberId: number | null) =>
    startTransition(() => {
      if (memberId === null) stopPreview();
      else startPreview(memberId);
      router.refresh();
    });
  return { pending, switchTo };
}

/** Whether the viewer can change this month's bills, columns, payments and months (PA, open month). */
export function useCanEdit(status: "open" | "closed"): boolean {
  const viewer = useViewer();
  return status === "open" && isAdmin(viewer);
}
