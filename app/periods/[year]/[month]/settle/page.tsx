import { SettleUp } from "@/components/settle-up";
import { getPeriodView } from "@/lib/periods";
import { parsePeriodParams, tabMetadata } from "../params";

export const generateMetadata = ({ params }: PageProps<"/periods/[year]/[month]/settle">) =>
  tabMetadata(params, "Settle Up");

// Tab: Settle Up — record payments, then close the month.
export default async function SettlePage({ params }: PageProps<"/periods/[year]/[month]/settle">) {
  const { year, month } = await parsePeriodParams(params);
  const view = (await getPeriodView(year, month))!;
  return <SettleUp view={view} />;
}
