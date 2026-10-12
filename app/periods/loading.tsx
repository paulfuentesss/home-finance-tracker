import { ContentSkeleton, ShellSkeleton } from "@/components/page-skeleton";

// Shown while switching months. It sits above the [month] layout, which loads the month from
// the database; a loading.tsx next to that layout wouldn't cover it (see Next's loading.js docs).
// So it draws the layout's frame (sidebar, header) itself.
export default function Loading() {
  return (
    <ShellSkeleton>
      <p className="sr-only" role="status">
        Loading the month…
      </p>
      <ContentSkeleton />
    </ShellSkeleton>
  );
}
