import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PeriodHeader } from "@/components/period-header";
import { monthLabel } from "@/lib/format";
import { getPeriodView } from "@/lib/periods";
import { parsePeriodParams } from "./params";

type Props = LayoutProps<"/periods/[year]/[month]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year, month } = await parsePeriodParams(params);
  return { title: monthLabel(year, month) };
}

// Shared by all four tabs: the header (month, stats, tabs) and the data-problem banner.
export default async function PeriodLayout({ params, children }: Props) {
  const { year, month } = await parsePeriodParams(params);
  const view = await getPeriodView(year, month);
  if (!view) notFound();

  return (
    <>
      <PeriodHeader view={view} />
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
        {view.issue && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">This month&apos;s numbers can&apos;t be calculated yet.</p>
              <p className="mt-1">{view.issue}. Fix it in Manage Columns &amp; People or the Advances Log.</p>
            </div>
          </div>
        )}
        {children}
      </main>
    </>
  );
}
