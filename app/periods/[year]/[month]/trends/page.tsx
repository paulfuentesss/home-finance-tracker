import { PageEnter } from "@/components/page-enter";
import { Trends } from "@/components/trends";
import { parseRange } from "@/lib/trends";
import { getTrends } from "@/lib/trends-data";
import { parsePeriodParams, tabMetadata } from "../params";

export const generateMetadata = ({ params }: PageProps<"/periods/[year]/[month]/trends">) =>
  tabMetadata(params, "Trends");

// Tab: Spending Trends (docs/features/trends.md). The last 1, 3 or 6 months (`?range=`) up to
// this one: household-wide totals, the same for everyone, so a preview changes nothing here.
export default async function TrendsPage({ params, searchParams }: PageProps<"/periods/[year]/[month]/trends">) {
  const { year, month } = await parsePeriodParams(params);
  const range = parseRange((await searchParams).range);
  return (
    <PageEnter>
      <Trends trends={await getTrends(year, month, range)} base={`/periods/${year}/${month}`} />
    </PageEnter>
  );
}
