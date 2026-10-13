import { HelperLog } from "@/components/helper-log";
import { PageEnter } from "@/components/page-enter";
import { getPeriodView } from "@/lib/periods";
import { parsePeriodParams, tabMetadata } from "../params";

export const generateMetadata = ({ params }: PageProps<"/periods/[year]/[month]/helper">) =>
  tabMetadata(params, "Helper");

// The Helper's visits and early pay (docs/features/helper.md).
export default async function HelperPage({ params }: PageProps<"/periods/[year]/[month]/helper">) {
  const { year, month } = await parsePeriodParams(params);
  const view = (await getPeriodView(year, month))!;
  return (
    <PageEnter>
      <HelperLog view={view} />
    </PageEnter>
  );
}
