import { SettleSummary } from "@/components/settle-summary";
import { SplitTable } from "@/components/split-table";
import { getPeriodView } from "@/lib/periods";
import { parsePeriodParams } from "./params";

// Tab 1: Monthly Split Table. The layout already loaded the month (cached per request) and
// provides the viewer.
export default async function SplitTablePage({ params }: PageProps<"/periods/[year]/[month]">) {
  const { year, month } = await parsePeriodParams(params);
  const view = (await getPeriodView(year, month))!;
  return (
    <>
      <SettleSummary view={view} />
      <SplitTable view={view} />
    </>
  );
}
