import { ShieldCheck } from "lucide-react";
import { ReceiptsCard, ReceiptsRow } from "@/components/receipts";
import { getViewer } from "@/lib/auth";
import { dateLabel } from "@/lib/format";
import { formatPHP } from "@/lib/money";
import { getPeriodReceipts, getPeriodView, type ViewReceipt } from "@/lib/periods";
import { isAdmin } from "@/lib/permissions";
import { parsePeriodParams, tabMetadata } from "../params";

export const generateMetadata = ({ params }: PageProps<"/periods/[year]/[month]/receipts">) =>
  tabMetadata(params, "Receipts");

// Tab 3: Payment Proofs / Receipts (docs/features/receipts.md). Proof of each bill paid and
// each settle-up payment: screenshots or photos in a private bucket. Never changes the math.
export default async function ReceiptsPage({ params }: PageProps<"/periods/[year]/[month]/receipts">) {
  const { year, month } = await parsePeriodParams(params);
  const view = (await getPeriodView(year, month))!;
  const [all, viewer] = await Promise.all([getPeriodReceipts(view.period.id), getViewer()]);
  const nameOf = new Map(view.members.map((m) => [m.id, m.name]));
  const status = view.period.status;
  const forBill = groupBy(all, (r) => r.billItemId);
  const forPayment = groupBy(all, (r) => r.paymentId);

  const note =
    status === "closed"
      ? "This month is closed, so its proofs can't change. Reopen it on Settle Up to attach or delete one."
      : viewer && isAdmin(viewer)
        ? "Attach a screenshot to each bill and payment. They're made smaller before upload."
        : "The admin attaches the proofs. Tap one to see it full size.";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5 shadow-xs">
        <h2 className="text-lg font-semibold">Payment Proofs &amp; Receipts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Screenshots of bank transfers and bill payments (MariBank, Maya, Bayad, GCash). {note}
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
                    Paid by {nameOf.get(bill.paidById) ?? "—"}
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
              const label = `${nameOf.get(p.fromMemberId) ?? "?"} → ${nameOf.get(p.toMemberId) ?? "?"}`;
              return (
                <ReceiptsRow
                  key={p.id}
                  owner={{ type: "payment", id: p.id }}
                  receipts={forPayment.get(p.id) ?? []}
                  status={status}
                  label={`${label}, ${formatPHP(p.amount)}`}
                >
                  <p className="font-medium">
                    {label} <span className="font-mono tabular-nums">{formatPHP(p.amount)}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {dateLabel(p.paidOn)}
                    {p.note && ` · ${p.note}`}
                  </p>
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
