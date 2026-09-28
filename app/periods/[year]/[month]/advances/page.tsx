import { AdvancesLog } from "@/components/advances-log";
import { AdvancesReport } from "@/components/advances-report";
import { getPeriodView } from "@/lib/periods";
import { parsePeriodParams } from "../params";

// Tab 2: Advances Log & Report.
export default async function AdvancesPage({ params }: PageProps<"/periods/[year]/[month]/advances">) {
  const { year, month } = await parsePeriodParams(params);
  const view = (await getPeriodView(year, month))!;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <AdvancesLog view={view} />
      <AdvancesReport view={view} />
    </div>
  );
}
