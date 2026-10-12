"use client"

import * as React from "react"
import { Drawer as SheetPrimitive } from "@base-ui/react/drawer"
import { cn } from "cn"

// A panel that slides in from the left edge (the phone menu, components/app-sidebar.tsx).
// Built on Base UI's Drawer (a dialog with swipe gestures): dragging the panel back to the
// left closes it, following the finger. Swiping in to open is app-sidebar.tsx's (lib/edge-swipe.ts).

function Sheet({ swipeDirection = "left", ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" swipeDirection={swipeDirection} {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

/**
 * `overlayClassName` goes on the backdrop and on the full-screen viewport that holds the panel,
 * so hiding them (`lg:hidden`) never leaves an invisible layer over the page.
 */
function SheetContent({
  className,
  overlayClassName,
  children,
  ...props
}: SheetPrimitive.Popup.Props & { overlayClassName?: string }) {
  return (
    <SheetPrimitive.Portal data-slot="sheet-portal">
      <SheetPrimitive.Backdrop
        data-slot="sheet-overlay"
        className={cn(
          // Fades as the panel is dragged away (--drawer-swipe-progress goes 0 → 1).
          "fixed inset-0 isolate z-50 bg-black/30 opacity-[calc(1-var(--drawer-swipe-progress,0))] transition-opacity duration-200 data-swiping:duration-0 data-starting-style:opacity-0 data-ending-style:opacity-0",
          overlayClassName
        )}
      />
      <SheetPrimitive.Viewport
        data-slot="sheet-viewport"
        className={cn("fixed inset-0 z-50 flex items-stretch justify-start", overlayClassName)}
      >
        <SheetPrimitive.Popup
          data-slot="sheet-content"
          className={cn(
            // A transition, not keyframes: the panel follows the finger while it's dragged
            // (--drawer-swipe-movement-x), then eases out or back.
            "relative flex h-full w-72 max-w-[85vw] touch-auto flex-col overflow-y-auto overscroll-contain shadow-xl outline-none [transform:translateX(var(--drawer-swipe-movement-x,0px))] transition-transform duration-200 ease-out data-swiping:duration-0 data-swiping:select-none data-starting-style:[transform:translateX(-100%)] data-ending-style:[transform:translateX(-100%)]",
            className
          )}
          {...props}
        >
          {children}
        </SheetPrimitive.Popup>
      </SheetPrimitive.Viewport>
    </SheetPrimitive.Portal>
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-base font-medium", className)}
      {...props}
    />
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle }
