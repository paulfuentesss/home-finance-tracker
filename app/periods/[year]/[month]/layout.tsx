import { Lock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackupReminderBanner } from "@/components/backup-reminder";
import { AppShell } from "@/components/app-sidebar";
import { MonthNotices } from "@/components/month-notices";
import { PeriodHeader, sidebarProps } from "@/components/period-header";
import { BillSeen } from "@/components/seen-tracker";
import { getPreview, getPreviewChoices, requireViewer } from "@/lib/auth";
import { backupReminderText } from "@/lib/backup-reminder";
import { getBackupReminder } from "@/lib/backup-status";
import { monthLabel, todayInManila } from "@/lib/format";
import { monthHasEnded } from "@/lib/month-lock";
import { startBlockReason } from "@/lib/month-start";
import { isAdmin } from "@/lib/permissions";
import { getPeriodView } from "@/lib/periods";
import { getAdminNudge, getBillNotice, getBillsDue } from "@/lib/reminder-status";
import { parsePeriodParams } from "./params";

type Props = LayoutProps<"/periods/[year]/[month]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year, month } = await parsePeriodParams(params);
  return { title: monthLabel(year, month) };
}

// Shared by every tab: the sidebar (month, sections, account), the header (section name,
// stats) and the data-problem banner.
// The viewer is provided to the tabs only to show or hide controls; getPeriodView and the
// Server Actions check it themselves. While PA previews as a housemate, everything here is
// drawn for that housemate under a banner saying so.
export default async function PeriodLayout({ params, children }: Props) {
  const { year, month } = await parsePeriodParams(params);
  const real = await requireViewer();
  // Who the page is drawn for: the housemate being previewed, or the real viewer. Only this
  // layout decides; the tabs read it from the context.
  const viewerP = getPreview().then((preview) => preview ?? real);
  // All at once. The notices (a housemate's emailed bill still to pay, or the admin's next step
  // and bills to pay the billers) need only the viewer, and share the month view's load of the
  // history (lib/periods.ts).
  const [preview, view, previewChoices, reminder, bill, nudge, billsDue] = await Promise.all([
    getPreview(),
    getPeriodView(year, month),
    getPreviewChoices(),
    getBackupReminder(real),
    viewerP.then(getBillNotice),
    viewerP.then(getAdminNudge),
    viewerP.then(getBillsDue),
  ]);
  if (!view) notFound();
  const viewer = preview ?? real;
  const previewBy = preview ? real : null;
  const admin = isAdmin(viewer);
  // Once the latest month has ended, why the next one hasn't started (admin only).
  const today = todayInManila();
  const latest = view.periods.at(-1);
  const toStart = admin && latest !== undefined && monthHasEnded(latest.year, latest.month, today);
  const startBlock = toStart ? await startBlockReason() : null;
  // When this page was drawn: only bill emails sent before it count as seen (BillSeen).
  const drawnAt = new Date();

  return (
    <AppShell viewer={viewer} previewBy={previewBy} sidebar={sidebarProps(view, viewer, previewChoices)}>
      <PeriodHeader view={view} />
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
        {/* The admin's own reminder: hidden while previewing as a housemate. */}
        {admin && reminder && <BackupReminderBanner text={backupReminderText(reminder)} />}
        <MonthNotices
          view={view}
          viewer={viewer}
          bill={bill}
          nudge={nudge}
          billsDue={billsDue}
          startBlock={startBlock}
          today={today}
        />
        {/* Marks the real viewer's bill email seen (the admin's Settle Up shows it); never while previewing. */}
        {!preview && !isAdmin(real) && <BillSeen drawnAt={drawnAt.getTime()} />}
        {view.period.status === "closed" && (
          <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <p>
              {admin
                ? `${monthLabel(year, month)} is closed, so nothing in it can be changed except a bill's Date paid. `
                : `${monthLabel(year, month)} is closed, so nothing in it can be changed. `}
              {admin ? (
                <>
                  <Link href={`/periods/${year}/${month}/settle`} className="font-medium underline underline-offset-2">
                    Reopen it in Settle Up
                  </Link>{" "}
                  to make changes.
                </>
              ) : (
                "Ask the admin to reopen it if something needs fixing."
              )}
            </p>
          </div>
        )}
        {view.issue && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">This month&apos;s numbers can&apos;t be calculated yet.</p>
              <p className="mt-1">
                {view.issue}.{" "}
                {admin ? "Fix it in Manage Columns & People or the Advances Log." : "Ask the admin to fix it."}
              </p>
            </div>
          </div>
        )}
        {children}
      </main>
    </AppShell>
  );
}
