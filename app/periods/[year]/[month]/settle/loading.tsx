import { SideColumnSkeleton } from "@/components/page-skeleton";

// Shown while Settle Up loads: who still owes beside the side column.
export default function Loading() {
  return <SideColumnSkeleton main={6} side={4} />;
}
