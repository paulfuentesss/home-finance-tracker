import { House } from "lucide-react";

/** The My House mark: the amber house tile beside the name (header, login, 404, error). */
export function HouseBadge() {
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600">
      <House className="size-5" aria-hidden />
    </div>
  );
}
