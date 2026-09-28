import { asc, desc, eq } from "drizzle-orm";
import { BillInbox } from "@/components/emailed-bills";
import { ManageBills } from "@/components/manage-bills";
import { ManageMembers } from "@/components/manage-members";
import { ManageSharedColumns } from "@/components/manage-shared-columns";
import { MeralcoPoints } from "@/components/meralco-points";
import { billEmails, db, members } from "@/db";
import { dateInManila } from "@/lib/format";
import { memberDotClass } from "@/lib/members";
import { toCentavos } from "@/lib/money";
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
  // The Bill inbox is household-wide, not per month.
  const inbox = await db.query.billEmails.findMany({
    where: eq(billEmails.status, "unmatched"),
    orderBy: [desc(billEmails.receivedAt)],
  });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <ManageBills view={view} />
        <ManageSharedColumns view={view} />
      </div>
      <div className="space-y-6">
        <BillInbox
          emails={inbox.map((e) => ({
            id: e.id,
            subject: e.subject,
            fromAddress: e.fromAddress,
            receivedOn: dateInManila(e.receivedAt),
            snippet: e.snippet,
            reason: e.reason,
            amount: e.amount === null ? null : toCentavos(e.amount),
            fee: e.fee === null ? 0 : toCentavos(e.fee),
            billYear: e.billYear,
            billMonth: e.billMonth,
            canRetry: e.provider !== null && e.amount !== null && e.billYear !== null,
          }))}
        />
        <MeralcoPoints view={view} />
        <ManageMembers
          members={active.map((m) => ({ id: m.id, name: m.name, isCollector: m.isCollector, dotClass: memberDotClass(m.sortOrder - 1) }))}
        />
      </div>
    </div>
  );
}
