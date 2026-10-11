// Reads for the backup reminder (lib/backup-reminder.ts) and the Manage tab's Backup card.
// Admin only: callers pass the real viewer, and anyone else gets nothing.

import "server-only";
import { desc } from "drizzle-orm";
import { cache } from "react";
import { backups, billingPeriods, db } from "@/db";
import { backupReminder, type BackupReminder } from "@/lib/backup-reminder";
import { isAdmin, type Viewer } from "@/lib/permissions";

/** When the latest Download backup finished, or null if there's none yet. */
export const getLastBackupAt = cache(async (): Promise<Date | null> => {
  const [last] = await db
    .select({ takenAt: backups.takenAt })
    .from(backups)
    .orderBy(desc(backups.takenAt))
    .limit(1);
  return last?.takenAt ?? null;
});

/** The reminder to show the admin, or null (nothing new since the last backup, or not the admin). */
export async function getBackupReminder(viewer: Viewer): Promise<BackupReminder | null> {
  if (!isAdmin(viewer)) return null;
  const [months, lastBackupAt] = await Promise.all([
    db
      .select({
        year: billingPeriods.year,
        month: billingPeriods.month,
        createdAt: billingPeriods.createdAt,
        closedAt: billingPeriods.closedAt,
      })
      .from(billingPeriods),
    getLastBackupAt(),
  ]);
  return backupReminder(months, lastBackupAt);
}
