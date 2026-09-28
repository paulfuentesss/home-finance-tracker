import { SettleSummary } from "@/components/settle-summary";
import { SplitTable } from "@/components/split-table";
import { requireViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getPeriodView } from "@/lib/periods";
import { parsePeriodParams } from "./params";

// Tab 1: Monthly Split Table. The layout already loaded the month and the viewer (both cached
// per request).
export default async function SplitTablePage({ params }: PageProps<"/periods/[year]/[month]">) {
  const { year, month } = await parsePeriodParams(params);
  const viewer = await requireViewer();
  const view = (await getPeriodView(year, month))!;
  return (
    <>
      <SettleSummary view={view} canRecord={isAdmin(viewer) && view.period.status === "open"} />
      <SplitTable view={view} />
    </>
  );
}
