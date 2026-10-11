"use client";

import { HardDriveDownload } from "lucide-react";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";

// The admin's reminder to download a backup (lib/backup-reminder.ts). Clicking hides it at
// once; the server records the backup when the download finishes, so the next page load only
// shows it again if the download didn't complete. A plain <a>, like the Backup card.
export function BackupReminderBanner({ text }: { text: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <HardDriveDownload className="size-4 shrink-0" />
      <p className="min-w-48 flex-1">{text}</p>
      <a href="/backup" onClick={() => setHidden(true)} className={buttonVariants({ size: "sm" })}>
        Download backup
      </a>
    </div>
  );
}
