import { SettleUp } from "@/components/settle-up";
import { getPeriodReceipts, getPeriodView } from "@/lib/periods";
import { parsePeriodParams, tabMetadata } from "../params";

export const generateMetadata = ({ params }: PageProps<"/periods/[year]/[month]/settle">) =>
  tabMetadata(params, "Settle Up");

// Tab: Settle Up — record payments (or a housemate's "I paid"), then close the month.
export default async function SettlePage({ params }: PageProps<"/periods/[year]/[month]/settle">) {
  const { year, month } = await parsePeriodParams(params);
  const view = (await getPeriodView(year, month))!;
  // Payment proofs, only the ones this viewer may open (PA and the two people in each payment).
  const receipts = await getPeriodReceipts(view.period.id);
  return <SettleUp view={view} receipts={receipts} />;
}
