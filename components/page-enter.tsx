import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Wraps a page's content so its cards fade up in turn when they replace the loading skeleton
 * (`.page-enter` in app/globals.css). Each direct child is one step of the stagger; `className`
 * keeps the page's own layout (a grid, `space-y-6`).
 */
export function PageEnter({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("page-enter", className)}>{children}</div>;
}
