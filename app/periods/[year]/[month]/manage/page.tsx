import { and, asc, count, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { BackupCard } from "@/components/backup-card";
import { BillInbox } from "@/components/emailed-bills";
import { ManageBills } from "@/components/manage-bills";
import { ManageMembers, type MemberActivityView } from "@/components/manage-members";
import { ManageSharedColumns } from "@/components/manage-shared-columns";
import { MeralcoPoints } from "@/components/meralco-points";
import { PageEnter } from "@/components/page-enter";
import { billEmails, db, memberDevices, members, pushSubscriptions } from "@/db";
import { getPreview, requireViewer } from "@/lib/auth";
import { getLastBackupAt } from "@/lib/backup-status";
import { deviceLabel, seenLabel, summarizeDevices, type MemberActivity } from "@/lib/devices";
import { dateInManila } from "@/lib/format";
import { householdDotClassOf, sharesCosts } from "@/lib/members";
import { toCentavos } from "@/lib/money";
import { isAdmin } from "@/lib/permissions";
import { getPeriodView } from "@/lib/periods";
import { parsePeriodParams, tabMetadata } from "../params";

export const generateMetadata = ({ params }: PageProps<"/periods/[year]/[month]/manage">) =>
  tabMetadata(params, "Manage");

// Tab 4: Manage Columns & People. PA only — it reads the database directly (logins included),
// so it checks the viewer itself instead of relying on getPeriodView. While PA previews as a
// housemate it bounces like it would for them.
export default async function ManagePage({ params }: PageProps<"/periods/[year]/[month]/manage">) {
  const { year, month } = await parsePeriodParams(params);
  const viewer = await requireViewer();
  if (!isAdmin(viewer)) redirect(`/periods/${year}/${month}`);
  // All at once, rather than one after another.
  const [preview, period, lastBackupAt, active, inbox, deviceRows, pushRows] = await Promise.all([
    getPreview(),
    getPeriodView(year, month),
    getLastBackupAt(),
    // Everyone currently in the household (not just this month's members).
    db.query.members.findMany({
      where: eq(members.active, true),
      orderBy: [asc(members.sortOrder), asc(members.id)],
    }),
    // The Bill inbox is household-wide, not per month.
    db.query.billEmails.findMany({
      where: eq(billEmails.status, "unmatched"),
      orderBy: [desc(billEmails.receivedAt)],
    }),
    // Who's using My House, from the app or a browser (lib/devices.ts), for everyone current.
    // Labels are worked out here, so only text goes to the browser.
    db
      .select({
        memberId: memberDevices.memberId,
        via: memberDevices.via,
        platform: memberDevices.platform,
        lastSeenAt: memberDevices.lastSeenAt,
      })
      .from(memberDevices)
      .innerJoin(members, and(eq(members.id, memberDevices.memberId), eq(members.active, true))),
    // Devices with notifications on (docs/features/notifications.md): the live site's only, the
    // ones that get pushes. Just a count per member goes to the browser.
    db
      .select({ memberId: pushSubscriptions.memberId, devices: count() })
      .from(pushSubscriptions)
      .innerJoin(members, and(eq(members.id, pushSubscriptions.memberId), eq(members.active, true)))
      .where(eq(pushSubscriptions.live, true))
      .groupBy(pushSubscriptions.memberId),
  ]);
  if (preview) redirect(`/periods/${year}/${month}`);
  const view = period!; // the layout already 404s a missing month
  const activity = summarizeDevices(deviceRows);
  const pushDevices = new Map(pushRows.map((r) => [r.memberId, r.devices]));
  const now = new Date();

  return (
    <PageEnter className="grid items-start gap-6 lg:grid-cols-2">
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
          viewerId={viewer.memberId}
          houseBudgetEmoji={view.houseBudgetEmoji}
          members={active.map((m) => ({
            id: m.id,
            name: m.name,
            isCollector: m.isCollector,
            viewOnly: !sharesCosts(m),
            dotClass: householdDotClassOf(m),
            emoji: m.emoji,
            email: m.email,
            linked: m.authUserId !== null,
            activity: activityView(activity.get(m.id), now),
            notifications: pushDevices.get(m.id) ?? 0,
          }))}
        />
        <BackupCard lastBackupAt={lastBackupAt} />
      </div>
    </PageEnter>
  );
}

/** A member's activity as the Manage card shows it, or null before their first visit. */
function activityView(activity: MemberActivity | undefined, now: Date): MemberActivityView | null {
  if (!activity) return null;
  return {
    installed: activity.installed,
    lastSeen: `${seenLabel(activity.lastSeen.lastSeenAt, now)} · ${deviceLabel(activity.lastSeen)}`,
    others: activity.devices.slice(1).map((d) => `${deviceLabel(d)} (${seenLabel(d.lastSeenAt, now)})`),
  };
}
