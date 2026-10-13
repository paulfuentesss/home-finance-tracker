import { SideColumnSkeleton } from "@/components/page-skeleton";

// Shown while Advances loads: the log beside the report.
export default function Loading() {
  return <SideColumnSkeleton main={8} side={5} />;
}
