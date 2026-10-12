import { SettleUp } from "@/components/settle-up";
import { requireViewer } from "@/lib/auth";
import { getPeriodReceipts, getPeriodView } from "@/lib/periods";
import { getEmailStatus } from "@/lib/reminder-status";
import { parsePeriodParams, tabMetadata } from "../params";

export const generateMetadata = ({ params }: PageProps<"/periods/[year]/[month]/settle">) =>
  tabMetadata(params, "Settle Up");

// Tab: Settle Up — record payments (or a housemate's "I paid"), email everyone their bill, then
// close the month.
export default async function SettlePage({ params }: PageProps<"/periods/[year]/[month]/settle">) {
  const { year, month } = await parsePeriodParams(params);
  const real = await requireViewer();
  const view = (await getPeriodView(year, month))!;
  // Payment proofs, only the ones this viewer may open (PA and the two people in each payment).
  // The bill-email box is the admin's (checked on the real viewer; hidden while previewing).
  const [receipts, emailStatus] = await Promise.all([getPeriodReceipts(view.period.id), getEmailStatus(real, year, month)]);
  return <SettleUp view={view} receipts={receipts} emailStatus={emailStatus} />;
}
