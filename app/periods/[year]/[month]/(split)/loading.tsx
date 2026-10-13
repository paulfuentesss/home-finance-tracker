import { SplitSkeleton } from "@/components/page-skeleton";

// Shown while the Split Table loads. Each tab has its own loading.tsx, shaped like that tab, and
// there's none above the month layout on purpose: switching months keeps the current month on
// screen until the new one is ready (docs/decisions.md).
export default function Loading() {
  return <SplitSkeleton />;
}
