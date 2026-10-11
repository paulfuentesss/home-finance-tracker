import { Billers } from "@/components/billers";
import { getBillers } from "@/lib/billers";
import { tabMetadata } from "../params";

export const generateMetadata = ({ params }: PageProps<"/periods/[year]/[month]/billers">) =>
  tabMetadata(params, "Billers");

// Tab: Billers & Accounts (docs/features/billers.md). The same in every month — the companies the
// household pays and their account details. getBillers leaves out what the viewer may not see.
export default async function BillersPage() {
  return <Billers billers={await getBillers()} />;
}
