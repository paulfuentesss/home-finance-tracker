import { PageEnter } from "@/components/page-enter";
import { Trends } from "@/components/trends";
import { getAllTrends } from "@/lib/trends-data";
import { parsePeriodParams, tabMetadata } from "../params";

export const generateMetadata = ({ params }: PageProps<"/periods/[year]/[month]/trends">) =>
  tabMetadata(params, "Trends");

// Tab: Spending Trends (docs/features/trends.md). The last 1, 3 or 6 months up to this one:
// household-wide totals, the same for everyone, so a preview changes nothing here. All three
// ranges come at once; the page picks one in the browser from `?range=` (instant, no reload).
export default async function TrendsPage({ params }: PageProps<"/periods/[year]/[month]/trends">) {
  const { year, month } = await parsePeriodParams(params);
  return (
    <PageEnter>
      <Trends byRange={await getAllTrends(year, month)} />
    </PageEnter>
  );
}
