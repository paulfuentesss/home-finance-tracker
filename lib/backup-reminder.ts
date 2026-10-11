// When to remind the admin to download a backup (docs/features/months.md): a month was started
// or closed after the latest backup. Pure, tested in lib/backup-reminder.test.ts; the month
// layout reads the data (lib/backup-status.ts).

import { monthLabel } from "./format";

export type MonthTimes = { year: number; month: number; createdAt: Date; closedAt: Date | null };

export type BackupReminder = {
  /** What happened most recently: a month was started or closed. */
  kind: "started" | "closed";
  year: number;
  month: number;
  /** No backup has been downloaded yet. */
  never: boolean;
};

/** The most recent month started or closed after `lastBackupAt`, or null when nothing is new. */
export function backupReminder(months: MonthTimes[], lastBackupAt: Date | null): BackupReminder | null {
  let latest: (Omit<BackupReminder, "never"> & { at: Date }) | null = null;
  for (const { year, month, createdAt, closedAt } of months) {
    if (!latest || createdAt > latest.at) latest = { kind: "started", year, month, at: createdAt };
    if (closedAt && closedAt > latest.at) latest = { kind: "closed", year, month, at: closedAt };
  }
  if (!latest || (lastBackupAt && lastBackupAt >= latest.at)) return null;
  const { kind, year, month } = latest;
  return { kind, year, month, never: lastBackupAt === null };
}

/** The banner's sentence. */
export function backupReminderText({ kind, year, month, never }: BackupReminder): string {
  if (never) return "No backup has been downloaded yet. Download one so the household's records are safe.";
  return kind === "started"
    ? `You started ${monthLabel(year, month)}. Download a backup so everything up to now is safe.`
    : `${monthLabel(year, month)} is closed. Download a backup so its final numbers are safe.`;
}
