import { Lock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PeriodHeader } from "@/components/period-header";
import { ViewerProvider } from "@/components/viewer-context";
import { requireViewer } from "@/lib/auth";
import { monthLabel } from "@/lib/format";
import { isAdmin } from "@/lib/permissions";
import { getPeriodView } from "@/lib/periods";
import { parsePeriodParams } from "./params";

type Props = LayoutProps<"/periods/[year]/[month]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year, month } = await parsePeriodParams(params);
  return { title: monthLabel(year, month) };
}

// Shared by all four tabs: the header (month, stats, tabs) and the data-problem banner.
// The viewer is provided to the tabs only to show or hide controls; getPeriodView and the
// Server Actions check it themselves.
export default async function PeriodLayout({ params, children }: Props) {
  const { year, month } = await parsePeriodParams(params);
  const viewer = await requireViewer();
  const view = await getPeriodView(year, month);
  if (!view) notFound();
  const admin = isAdmin(viewer);

  return (
    <ViewerProvider viewer={viewer}>
      <PeriodHeader view={view} viewer={viewer} />
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
        {view.period.status === "closed" && (
          <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <p>
              {monthLabel(year, month)} is closed, so nothing in it can be changed.{" "}
              {admin ? (
                <>
                  <Link href={`/periods/${year}/${month}/settle`} className="font-medium underline underline-offset-2">
                    Reopen it in Settle Up
                  </Link>{" "}
                  to make changes.
                </>
              ) : (
                "Ask PA to reopen it if something needs fixing."
              )}
            </p>
          </div>
        )}
        {view.issue && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">This month&apos;s numbers can&apos;t be calculated yet.</p>
              <p className="mt-1">
                {view.issue}.{" "}
                {admin ? "Fix it in Manage Columns & People or the Advances Log." : "Ask PA to fix it."}
              </p>
            </div>
          </div>
        )}
        {children}
      </main>
    </ViewerProvider>
  );
}
