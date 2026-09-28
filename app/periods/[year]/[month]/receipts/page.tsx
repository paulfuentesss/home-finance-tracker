import { ImageOff, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateLabel } from "@/lib/format";
import { formatPHP } from "@/lib/money";
import { getPeriodView } from "@/lib/periods";
import { parsePeriodParams } from "../params";

// Tab 3: Payment Proofs / Receipts. Layout only for now — uploads (a private Supabase
// Storage bucket + receipts table) come in the next round.
export default async function ReceiptsPage({ params }: PageProps<"/periods/[year]/[month]/receipts">) {
  const { year, month } = await parsePeriodParams(params);
  const view = (await getPeriodView(year, month))!;
  const nameOf = new Map(view.members.map((m) => [m.id, m.name]));

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5 shadow-xs">
        <div>
          <h2 className="text-lg font-semibold">Payment Proofs &amp; Receipts</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Screenshots of bank transfers and bill payments (MariBank, Maya, Bayad, GCash).
          </p>
        </div>
        <Button disabled title="Receipt uploads are coming next">
          <Upload />
          Attach receipt · coming soon
        </Button>
      </section>

      {view.bills.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white p-10 text-center text-muted-foreground">
          No bills this month yet.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {view.bills.map((bill) => (
            <article key={bill.id} className="overflow-hidden rounded-xl border bg-white shadow-xs">
              <div className="relative flex aspect-[16/9] flex-col items-center justify-center gap-2 bg-zinc-100 text-zinc-400">
                <ImageOff className="size-8" />
                <span className="text-sm">No proof attached yet</span>
                {bill.paidOn && (
                  <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-emerald-700 shadow-xs">
                    <ShieldCheck className="size-3.5" />
                    Paid
                  </span>
                )}
              </div>
              <div className="space-y-1 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{bill.name}</h3>
                  <span className="font-mono font-semibold text-amber-700 tabular-nums">{formatPHP(bill.total)}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Paid by {nameOf.get(bill.paidById) ?? "—"}
                  {bill.paidOn && ` · ${dateLabel(bill.paidOn)}`}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
