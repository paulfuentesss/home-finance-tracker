"use client";

import Link from "next/link";
import { useCanEdit } from "@/components/viewer-context";
import type { PeriodView } from "@/lib/periods";

/** "Who owes what"'s link: PA (open month) records payments; everyone else sees Settle Up. */
export function SettleUpLink({ period }: { period: Pick<PeriodView["period"], "year" | "month" | "status"> }) {
  const canRecord = useCanEdit(period.status);
  return (
    <Link
      href={`/periods/${period.year}/${period.month}/settle`}
      className="text-xs font-medium text-amber-700 underline-offset-2 hover:underline"
    >
      {canRecord ? "Record payments →" : "See Settle Up →"}
    </Link>
  );
}
