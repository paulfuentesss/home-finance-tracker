import { ContentSkeleton, HeaderSkeleton } from "@/components/page-skeleton";

// Shown while switching months. It sits above the [month] layout, which loads the month from
// the database; a loading.tsx next to that layout wouldn't cover it (see Next's loading.js docs).
export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      <main className="mx-auto w-full max-w-7xl px-4 py-8">
        <p className="sr-only" role="status">
          Loading the month…
        </p>
        <ContentSkeleton />
      </main>
    </>
  );
}
