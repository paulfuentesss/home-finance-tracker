import { House } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The My House mark: the amber house tile beside the name (sidebar, phone top bar, login, 404,
 * error). `dark` is for the dark sidebar: a soft amber tint instead of the pale tile and border,
 * which stood out like a sticker there.
 */
export function HouseBadge({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-xl",
        dark
          ? "bg-amber-400/15 text-amber-400 ring-1 ring-amber-400/20 ring-inset"
          : "border border-amber-200 bg-amber-50 text-amber-600",
      )}
    >
      <House className="size-5" aria-hidden />
    </div>
  );
}
