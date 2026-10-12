import { CalendarClock, CalendarPlus, Hourglass, Lock, Mail, ReceiptText } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { monthLabel } from "@/lib/format";
import { monthAfter, monthHasEnded } from "@/lib/month-lock";
import { isAdmin, isViewOnly, type Viewer } from "@/lib/permissions";
import type { PeriodView } from "@/lib/periods";
import type { BillNotice } from "@/lib/reminder-status";
import { housemateNotice, type AdminNudge } from "@/lib/reminders";
import { cn } from "@/lib/utils";

// The month pages' notices about month ends and bills (docs/features/reminders.md): the in-app
// copy of the reminder emails, shown only when there's something to do. Drawn for whoever the
// page is for, so "Preview as a housemate" shows theirs.
export function MonthNotices({
  view,
  viewer,
  bill,
  nudge,
  startBlock,
  today,
}: {
  view: PeriodView;
  viewer: Viewer;
  bill: BillNotice | null;
  /** The admin's next step (null for anyone else). */
  nudge: AdminNudge | null;
  /** Why the next month can't start yet (lib/month-start.ts → startBlockReason), or null. */
  startBlock: string | null;
  /** Manila's date, "YYYY-MM-DD". */
  today: string;
}) {
  const admin = isAdmin(viewer);
  const { year, month, status, ended } = view.period;
  const latest = view.periods.at(-1) ?? null;
  const toStart = latest && monthHasEnded(latest.year, latest.month, today) ? monthAfter(latest.year, latest.month) : null;
  const collectorName = view.members.find((m) => m.isCollector)?.name ?? "the admin";
  const notice =
    !admin && !isViewOnly(viewer)
      ? housemateNotice({ bill, latest: latest && { ...latest, status: view.latestStatus }, today, collectorName })
      : null;
  const next = monthAfter(year, month);

  return (
    <>
      {/* The admin: the next month starts by itself each morning; until it has, housemates
          have nowhere to log. Says why when something stops it. */}
      {admin && latest && toStart && (
        <Notice icon={<CalendarPlus />} tone="amber">
          {monthLabel(toStart.year, toStart.month)} hasn&apos;t started yet, so housemates have nowhere to log new
          expenses.{" "}
          {startBlock
            ? `It can't start until this is fixed: ${startBlock}`
            : "It starts by itself around 9am, or start it now from the month picker."}
        </Notice>
      )}
      {/* The admin's next step for the month that just ended (lib/reminders.ts → adminNudge). */}
      {nudge && (
        <Notice
          icon={nudge.kind === "close" ? <Lock /> : <Mail />}
          tone="amber"
          action={
            <Link href={`/periods/${nudge.year}/${nudge.month}/settle`} className={buttonVariants({ size: "sm" })}>
              Go to Settle Up
            </Link>
          }
        >
          {nudge.text}
        </Notice>
      )}
      {/* This month is over but not closed: locked for housemates. (The admin's latest month
          already has the notice above.) */}
      {status === "open" && ended && !(admin && view.isLatest) && (
        <Notice icon={<Lock />} tone="zinc">
          {admin ? (
            <>
              {monthLabel(year, month)} has ended, so housemates can&apos;t change it anymore. You still can, until you
              close it in Settle Up.
            </>
          ) : (
            <>
              {monthLabel(year, month)} has ended, so only the admin can change it now. Log anything new in{" "}
              {view.next ? (
                <Link
                  href={`/periods/${view.next.year}/${view.next.month}/advances`}
                  className="font-medium underline underline-offset-2"
                >
                  {monthLabel(view.next.year, view.next.month)}
                </Link>
              ) : (
                `${monthLabel(next.year, next.month)} once it starts`
              )}
              .
            </>
          )}
        </Notice>
      )}
      {notice?.kind === "bill" && (
        <Notice
          icon={<ReceiptText />}
          tone="amber"
          action={
            <Link href={notice.href} className={buttonVariants({ size: "sm" })}>
              Pay in Settle Up
            </Link>
          }
        >
          {notice.text}
        </Notice>
      )}
      {notice?.kind === "waiting" && (
        <Notice icon={<Hourglass />} tone="zinc">
          {notice.text}
        </Notice>
      )}
      {notice?.kind === "deadline" && (
        <Notice icon={<CalendarClock />} tone={notice.lastDay ? "amber" : "zinc"}>
          {notice.text}
        </Notice>
      )}
    </>
  );
}

function Notice({
  icon,
  tone,
  action,
  children,
}: {
  icon: React.ReactNode;
  tone: "amber" | "zinc";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm [&>svg]:size-4 [&>svg]:shrink-0",
        tone === "amber" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-zinc-200 bg-zinc-50 text-zinc-700",
      )}
    >
      {icon}
      <p className="min-w-48 flex-1">{children}</p>
      {action}
    </div>
  );
}
