import { asc, eq } from "drizzle-orm";
import { ManageBills } from "@/components/manage-bills";
import { ManageMembers } from "@/components/manage-members";
import { ManageSharedColumns } from "@/components/manage-shared-columns";
import { MeralcoPoints } from "@/components/meralco-points";
import { db, members } from "@/db";
import { memberDotClass } from "@/lib/members";
import { getPeriodView } from "@/lib/periods";
import { parsePeriodParams } from "../params";

// Tab 4: Manage Columns & People.
export default async function ManagePage({ params }: PageProps<"/periods/[year]/[month]/manage">) {
  const { year, month } = await parsePeriodParams(params);
  const view = (await getPeriodView(year, month))!;
  // Everyone currently in the household (not just this month's members).
  const active = await db.query.members.findMany({
    where: eq(members.active, true),
    orderBy: [asc(members.sortOrder), asc(members.id)],
  });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <ManageBills view={view} />
        <ManageSharedColumns view={view} />
      </div>
      <div className="space-y-6">
        <MeralcoPoints view={view} />
        <ManageMembers
          members={active.map((m) => ({ id: m.id, name: m.name, isCollector: m.isCollector, dotClass: memberDotClass(m.sortOrder - 1) }))}
        />
      </div>
    </div>
  );
}
