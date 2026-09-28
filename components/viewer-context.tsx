"use client";

import { createContext, useContext } from "react";
import { isAdmin, type Viewer } from "@/lib/permissions";

// Who's signed in, for showing or hiding controls. Only a hint for the UI: every page read and
// Server Action checks the viewer again on the server (lib/auth.ts, run()).

const ViewerContext = createContext<Viewer | null>(null);

export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  const viewer = useContext(ViewerContext);
  if (!viewer) throw new Error("useViewer() needs a <ViewerProvider> (the month layout provides one).");
  return viewer;
}

/** Whether the viewer can change this month's bills, columns, payments and months (PA, open month). */
export function useCanEdit(status: "open" | "closed"): boolean {
  const viewer = useViewer();
  return status === "open" && isAdmin(viewer);
}
