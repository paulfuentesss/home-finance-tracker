import { cookies } from "next/headers";
import { PageEnter } from "@/components/page-enter";
import { SettleUp } from "@/components/settle-up";
import { requireViewer } from "@/lib/auth";
import { getPeriodReceipts, getPeriodView } from "@/lib/periods";
import { getEmailStatus } from "@/lib/reminder-status";
import { COMPACT_COOKIE } from "@/lib/settle-up-view";
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
  // The phone's Compact / Normal choice for Who still owes (lib/settle-up-view.ts).
  const compact = (await cookies()).get(COMPACT_COOKIE)?.value === "1";
  return (
    <PageEnter>
      <SettleUp view={view} receipts={receipts} emailStatus={emailStatus} compact={compact} />
    </PageEnter>
  );
}
