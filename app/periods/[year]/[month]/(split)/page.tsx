import { Greeting } from "@/components/greeting";
import { PageEnter } from "@/components/page-enter";
import { SettleSummary } from "@/components/settle-summary";
import { SplitTable } from "@/components/split-table";
import { partOfDayInManila } from "@/lib/format";
import { getPeriodView } from "@/lib/periods";
import { parsePeriodParams } from "../params";

// Tab 1: Monthly Split Table, at /periods/<year>/<month>. It sits in the (split) route group
// (not part of the URL) only so it can have its own loading.tsx, like the other tabs.
// The layout already loaded the month (cached per request) and provides the viewer.
export default async function SplitTablePage({ params }: PageProps<"/periods/[year]/[month]">) {
  const { year, month } = await parsePeriodParams(params);
  const view = (await getPeriodView(year, month))!;
  return (
    <PageEnter className="space-y-6">
      <Greeting view={view} partOfDay={partOfDayInManila(new Date())} />
      <SettleSummary view={view} />
      <SplitTable view={view} />
    </PageEnter>
  );
}
