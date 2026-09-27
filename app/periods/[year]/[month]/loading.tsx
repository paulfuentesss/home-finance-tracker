import { ContentSkeleton } from "@/components/page-skeleton";

// Shown while switching tabs within a month (the header above stays in place).
export default function Loading() {
  return (
    <>
      <p className="sr-only" role="status">
        Loading…
      </p>
      <ContentSkeleton />
    </>
  );
}
