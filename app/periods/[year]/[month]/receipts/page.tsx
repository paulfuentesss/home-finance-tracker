import { ShieldCheck } from "lucide-react";
import { Pair } from "@/components/member-pair";
import { ReceiptsCard, ReceiptsNote, ReceiptsRow } from "@/components/receipts";
import { dateLabel } from "@/lib/format";
import { formatPHP } from "@/lib/money";
import { getPeriodReceipts, getPeriodView, type ViewReceipt } from "@/lib/periods";
import { parsePeriodParams, tabMetadata } from "../params";

export const generateMetadata = ({ params }: PageProps<"/periods/[year]/[month]/receipts">) =>
  tabMetadata(params, "Receipts");

// Tab 3: Payment Proofs / Receipts (docs/features/receipts.md). Proof of each bill paid and
// each settle-up payment: screenshots or photos in a private bucket. Never changes the math.
export default async function ReceiptsPage({ params }: PageProps<"/periods/[year]/[month]/receipts">) {
  const { year, month } = await parsePeriodParams(params);
  const view = (await getPeriodView(year, month))!;
  const all = await getPeriodReceipts(view.period.id);
  const memberOf = new Map(view.members.map((m) => [m.id, m]));
  const status = view.period.status;
  const forBill = groupBy(all, (r) => r.billItemId);
  const forPayment = groupBy(all, (r) => r.paymentId);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5 shadow-xs">
        <h2 className="text-lg font-semibold">Payment Proofs &amp; Receipts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Screenshots of bank transfers and bill payments (MariBank, Maya, Bayad, GCash). <ReceiptsNote status={status} />
        </p>
      </section>

      <section aria-labelledby="bill-proofs" className="space-y-3">
        <h3 id="bill-proofs" className="font-semibold">
          Bills
        </h3>
        {view.bills.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-white p-10 text-center text-muted-foreground">
            No bills this month yet.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {view.bills.map((bill) => (
              <ReceiptsCard
                key={bill.id}
                owner={{ type: "bill", id: bill.id }}
                receipts={forBill.get(bill.id) ?? []}
                status={status}
                label={bill.name}
                badge={
                  bill.paidOn && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-emerald-700 shadow-xs">
                      <ShieldCheck className="size-3.5" />
                      Paid
                    </span>
                  )
                }
              >
                <div className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="font-semibold">{bill.name}</h4>
                    <span className="font-mono font-semibold text-amber-700 tabular-nums">{formatPHP(bill.total)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Paid by {memberOf.get(bill.paidById)?.name ?? "—"}
                    {bill.paidOn && ` · ${dateLabel(bill.paidOn)}`}
                  </p>
                </div>
              </ReceiptsCard>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="payment-proofs" className="space-y-3">
        <h3 id="payment-proofs" className="font-semibold">
          Payments
        </h3>
        {view.payments.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-white p-10 text-center text-muted-foreground">
            No payments recorded this month yet. They&apos;re recorded on Settle Up.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border bg-white px-4 shadow-xs sm:px-5">
            {view.payments.map((p) => {
              const from = memberOf.get(p.fromMemberId);
              const to = memberOf.get(p.toMemberId);
              const label = `${from?.name ?? "?"} → ${to?.name ?? "?"}`;
              return (
                <ReceiptsRow
                  key={p.id}
                  owner={{ type: "payment", id: p.id }}
                  receipts={forPayment.get(p.id) ?? []}
                  status={status}
                  label={`${label}, ${formatPHP(p.amount)}`}
                >
                  {/* Laid out like the bill cards above: who on the left, amount on the right. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      {from && to ? <Pair from={from} to={to} /> : <p className="text-sm font-medium">{label}</p>}
                      <p className="text-xs text-muted-foreground">
                        {dateLabel(p.paidOn)}
                        {p.note && ` · ${p.note}`}
                        {/* A housemate's "I paid": it only counts once PA confirms it (Settle Up). */}
                        {p.status === "pending" && " · waiting for PA"}
                        {p.status === "rejected" && ` · rejected: ${p.rejectedReason}`}
                      </p>
                    </div>
                    <span
                      className={
                        p.status === "rejected"
                          ? "shrink-0 font-mono font-semibold text-muted-foreground tabular-nums line-through"
                          : "shrink-0 font-mono font-semibold text-amber-700 tabular-nums"
                      }
                    >
                      {formatPHP(p.amount)}
                    </span>
                  </div>
                </ReceiptsRow>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function groupBy(receipts: ViewReceipt[], key: (r: ViewReceipt) => number | null) {
  const groups = new Map<number, ViewReceipt[]>();
  for (const r of receipts) {
    const k = key(r);
    if (k !== null) groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return groups;
}
