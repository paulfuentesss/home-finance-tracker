import { Download, HardDriveDownload } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// Download backup (docs/operations.md → Backups). A plain <a>, not <Link> (which would prefetch
// the zip) and without `download`: the route's Content-Disposition makes it a download, and an
// expired login or an error then shows as a page instead of being saved as a "backup".
export function BackupCard() {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-xs">
      <div className="flex items-center gap-2">
        <HardDriveDownload className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Backup</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        A zip of everything: every month&apos;s data and every receipt picture. Supabase&apos;s free plan
        keeps no backups, so download one after closing each month and keep it somewhere safe. It holds
        private household details.
      </p>
      <a href="/backup" className={buttonVariants({ variant: "outline", className: "mt-4" })}>
        <Download />
        Download backup
      </a>
    </section>
  );
}
