import { SplitTable } from "@/components/split-table";
import { getPeriodView } from "@/lib/periods";
import { parsePeriodParams } from "./params";

// Tab 1: Monthly Split Table. The layout already loaded the month (cached per request).
export default async function SplitTablePage({ params }: PageProps<"/periods/[year]/[month]">) {
  const { year, month } = await parsePeriodParams(params);
  const view = (await getPeriodView(year, month))!;
  return <SplitTable view={view} />;
}
