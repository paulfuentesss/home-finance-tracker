import { redirect } from "next/navigation";
import { CashDrawer } from "@/components/cash-drawer";
import { PageEnter } from "@/components/page-enter";
import { getPreview, requireViewer } from "@/lib/auth";
import { getCashDrawer } from "@/lib/cash-drawer-data";
import { isAdmin } from "@/lib/permissions";
import { parsePeriodParams, tabMetadata } from "../params";

export const generateMetadata = ({ params }: PageProps<"/periods/[year]/[month]/drawer">) =>
  tabMetadata(params, "Cash Drawer");

// Tab: Cash Drawer (docs/features/cash-drawer.md). PA only, and the same in every month — his
// cash at home, not part of the split. While he previews as a housemate it bounces like it
// would for them.
export default async function CashDrawerPage({ params }: PageProps<"/periods/[year]/[month]/drawer">) {
  const { year, month } = await parsePeriodParams(params);
  const viewer = await requireViewer();
  if (!isAdmin(viewer)) redirect(`/periods/${year}/${month}`);
  const [preview, drawer] = await Promise.all([getPreview(), getCashDrawer()]);
  if (preview || !drawer) redirect(`/periods/${year}/${month}`);
  return (
    <PageEnter>
      <CashDrawer drawer={drawer} />
    </PageEnter>
  );
}
