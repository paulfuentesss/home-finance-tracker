import { ArrowLeft, CircleHelp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { FaqAccordion } from "@/components/faq-accordion";
import { monthLabel } from "@/lib/format";
import { paymentFee } from "@/lib/bill-email/fees";
import { BILL_EMAIL_COLUMNS, MERALCO_POINT_ITEMS, MERALCO_POINTS_AS_OF } from "@/lib/household-config";
import { formatPHP } from "@/lib/money";
import { getLatestPointsBills } from "@/lib/periods";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "How it works" };

// A plain-language guide for the household. Keep it in sync with docs/settlement-rules.md.
export default async function HowItWorksPage() {
  await connection();
  const { period, bills, members } = await getLatestPointsBills();
  const back = period ? `/periods/${period.year}/${period.month}` : "/";
  // From the BILL_PAYMENT_FEES setting, so this page never shows an old fee.
  const feeList = (Object.keys(BILL_EMAIL_COLUMNS) as (keyof typeof BILL_EMAIL_COLUMNS)[])
    .map((provider) => ({ column: BILL_EMAIL_COLUMNS[provider], ...paymentFee(provider) }))
    .filter((f) => f.fee > 0);
  const fees = feeList.map((f) => `${formatPHP(f.fee)} for ${f.column}${f.note ? `, the ${f.note}` : ""}`);
  const firstFeeNote = feeList[0]?.note ?? "payment fee";

  const faqs = [
    {
      id: "equal",
      q: "How are bills split?",
      a: (
        <>
          <p>
            Water, PLDT and the Helper are always split <strong>equally</strong> between everyone in the house
            that month. Amounts are worked out to the exact centavo, so everyone&apos;s shares always add up to the real
            bill.
          </p>
          <p>
            When a bill doesn&apos;t divide evenly, the leftover centavo or two goes to <strong>PA</strong> (who
            collects), so it never lands on anyone else. Example: ₱2,173.63 Water ÷ 5 = ₱434.726…, so three people pay
            ₱434.73 and two pay ₱434.72.
          </p>
        </>
      ),
    },
    {
      id: "points",
      q: "How is Meralco split? What do the points mean?",
      a: (
        <>
          <p>
            Electricity isn&apos;t used equally — aircon and a PC use a lot more — so Meralco is split with a{" "}
            <strong>point system</strong>. Each person has points based on what they use (see the table above). The
            bill is divided into as many equal parts as there are points in total, and each person pays for their own
            points.
          </p>
          <p>
            <strong>Cost per point = bill ÷ total points.</strong> Someone with 2 points pays twice as much as someone
            with 1 point. Meralco always uses points; the allocation is changed in Manage Columns &amp; People.
          </p>
        </>
      ),
    },
    {
      id: "manual",
      q: "Can a new bill be split some other way?",
      a: (
        <p>
          When a new bill column is added it&apos;s set to <strong>Auto equal</strong> or <strong>Manual</strong>, and
          stays that way. For a Manual bill each person&apos;s amount is typed in, and the bill&apos;s total is the
          sum.
        </p>
      ),
    },
    {
      id: "shared-advances",
      q: "What are shared advances? Why are some “w/o PA”?",
      a: (
        <>
          <p>
            A shared advance is something one person paid for the whole house — groceries, palengke, gas, a service.
            It&apos;s logged into a <strong>shared column</strong>, usually <strong>Advances Shared</strong> (everyone),
            and everyone in that column pays an equal part — including the person who paid, who gets the rest back.
          </p>
          <p>
            When the usual split doesn&apos;t fit, a separate column is added for that month. For example PA was away
            from Aug 8, so those purchases went into &ldquo;Advances Shared w/o PA&rdquo;, shared by the other four.
          </p>
          <p>
            Logged something wrong, or in the wrong column? Edit it in the Advances Log (the pencil next to it) and
            everyone&apos;s shares are recalculated.
          </p>
        </>
      ),
    },
    {
      id: "custom-split",
      q: "What if something isn't shared equally?",
      a: (
        <p>
          Switch a shared column to <strong>Manual</strong> and type each person&apos;s amount — like the{" "}
          <strong>Ice Maker Adj.</strong>, where Ate Toni covers half and the other four split the rest. If the typed
          amounts don&apos;t add up to the column&apos;s total, the table shows how much it&apos;s over or short.
        </p>
      ),
    },
    {
      id: "month-final",
      q: "What does Month Final mean?",
      a: (
        <>
          <p>
            <strong>Month Final = your share of everything − what you paid this month</strong> (advances and any
            bills you paid).
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Positive (e.g. ₱6,315.13): you still need to pay this amount.</li>
            <li>Negative (e.g. −₱16,967.93): you paid more than your share and get this back.</li>
          </ul>
          <p>
            <strong>Final</strong> adds last month&apos;s unsettled balance, takes off any payments already made, and
            spells out what&apos;s left:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium text-rose-600">To pay</span> — pay this amount to PA.
            </li>
            <li>
              <span className="font-medium text-emerald-700">To receive</span> — PA pays this amount back to you.
            </li>
            <li>
              <span className="font-medium text-zinc-600">Settled</span> — ₱0.00, nothing to do.
            </li>
          </ul>
          <p>
            Everyone&apos;s Month Finals add up to ₱0.00 — what some owe is what others get back. If a Manual column
            is a few centavos over or short, the total shows that difference.
          </p>
        </>
      ),
    },
    {
      id: "who-pays",
      q: "Why does PA usually pay the bills?",
      a: (
        <p>
          PA pays Meralco, Water, PLDT and usually the Helper upfront, and everyone settles with PA. Whoever pays a bill
          — PA or anyone else — gets it counted as money they paid, so it comes off their Month Final.
        </p>
      ),
    },
    {
      id: "emailed-bills",
      q: "What does “Pending” on a bill mean?",
      a: (
        <>
          <p>
            Meralco, Water and PLDT email their bills, and the app reads the amount and due date from the email. The
            bill goes into the month it&apos;s for (the month the provider names, e.g. &ldquo;Meralco bill for August
            2026&rdquo;) marked <strong>Pending</strong>.
          </p>
          <p>
            The small fee for paying it is added and shared like the bill
            {fees.length > 0 ? `: ${fees.join("; ")}` : ""}. The column says so, e.g. &ldquo;Emailed bill ₱… + ₱…
            {fees.length > 0 ? ` ${firstFeeNote}` : " payment fee"}&rdquo;.
          </p>
          <p>
            A pending bill is <strong>not counted yet</strong>: nobody&apos;s totals change until PA checks it and taps{" "}
            <strong>Confirm</strong>. PA can still change the amount first. <strong>Discard</strong> puts the bill back
            to ₱0.00 to type in by hand.
          </p>
          <p>
            An emailed bill never replaces an amount that&apos;s already there. If its month hasn&apos;t started yet,
            is closed, or already has that bill, it waits in the <strong>Bill Inbox</strong> (Manage) instead. A month
            can&apos;t be closed while a bill in it is still pending.
          </p>
        </>
      ),
    },
    {
      id: "move-in-out",
      q: "What happens when someone moves in or out?",
      a: (
        <>
          <p>
            Someone who <strong>moves in</strong> joins every open month: equal bills are re-split to include them,
            they start at 0 Meralco points until theirs are set, and they share the everyday Advances Shared column.
          </p>
          <p>
            Someone who <strong>moves out</strong> is left out of future months. In a month where they already have
            something recorded — an advance, a payment, a bill they paid, or an amount typed for them in a Manual bill
            or column — they stay, so that month&apos;s numbers don&apos;t change. Otherwise they&apos;re taken out and
            the bills re-split. A new month&apos;s bill they&apos;re down as paying but that is still ₱0 goes to PA.
          </p>
          <p>
            Someone who still owes, or is still owed, money from an earlier month also stays until it&apos;s settled,
            so an unpaid balance never disappears.
          </p>
        </>
      ),
    },
    {
      id: "carry-over",
      q: "What happens if I don't pay in full?",
      a: (
        <p>
          Nothing is lost: whatever is still unpaid at the end of a month carries over to the next month&apos;s
          &ldquo;Prev Month Unsettled&rdquo; column and is added to that month&apos;s Final.
        </p>
      ),
    },
    {
      id: "payments",
      q: "How do I record that I paid?",
      a: (
        <>
          <p>
            Pay PA, and PA records it in the <strong>Settle Up</strong> tab, which lists who still owes whom — everyone
            settles with PA. &ldquo;Record payment&rdquo; fills in the amount; PA changes it if you only paid part.
          </p>
          <p>
            A payment comes off the payer&apos;s Final and the receiver&apos;s, and shows in the Split Table&apos;s
            Payments column. Pay back ₱12,098.09 you owed and your Final goes to ₱0.00 — Settled.
          </p>
        </>
      ),
    },
    {
      id: "who-can-change-what",
      q: "Who can change what?",
      a: (
        <>
          <p>
            Everyone in the household signs in with their own login — Google, or a code sent to their email — and can
            see every month. Only emails PA has added can sign in.
          </p>
          <p>
            You can log your own advances into <strong>Advances Shared</strong>, and edit or delete them while
            they&apos;re there. Everything else — bills, points, other shared columns, payments, attaching proof of
            payment (Receipts), moving in and out, closing months — is done by PA. If one of your advances should be split differently (say, not with
            everyone), PA moves it to the right column; after that, it&apos;s PA&apos;s to change.
          </p>
        </>
      ),
    },
    {
      id: "closing",
      q: "What does closing a month do?",
      a: (
        <>
          <p>
            Once a month is done, PA <strong>closes</strong> it in Settle Up. A closed month is locked: nothing in it
            can be changed (its proofs of payment included), and everyone&apos;s Final is saved as next month&apos;s Prev Month Unsettled. Unpaid
            amounts simply carry over.
          </p>
          <p>
            Months close in order (July before August), and only once no bill in it is still pending. If something
            needs fixing, PA can <strong>reopen</strong> the latest closed month, fix it, and close it again.
          </p>
        </>
      ),
    },
  ];

  return (
    <div className="min-h-full">
      <header className="border-b bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600">
              <CircleHelp className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">How it works</h1>
              <p className="text-sm text-muted-foreground">How My House splits the house costs</p>
            </div>
          </div>
          <Link href={back} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            {period ? `Back to ${monthLabel(period.year, period.month)}` : "Back"}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
        <section id="points-table" className="rounded-xl border bg-white p-5 shadow-xs">
          <h2 className="font-semibold">Meralco point system</h2>
          <p className="mt-1 text-sm text-muted-foreground">Current allocation as of {MERALCO_POINTS_AS_OF}.</p>

          {bills.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No bill is split by points in the latest month. Meralco is the points bill; its points are set in
              Manage Columns &amp; People.
            </p>
          ) : (
            bills.map((bill) => {
              const perPoint = bill.perUnit?.amount ?? 0;
              return (
                <div key={bill.id} className="mt-4">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left text-muted-foreground">
                      <tr>
                        <th className="py-2 font-medium">{bill.name}</th>
                        <th className="py-2 text-right font-medium">Points</th>
                        <th className="py-2 text-right font-medium">
                          {period ? monthLabel(period.year, period.month) : ""} share
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {members.map((m) => {
                        const share = bill.shares[String(m.id)];
                        return (
                          <tr key={m.id}>
                            <td className="py-2">
                              <span className="flex items-center gap-2">
                                <span className={cn("size-2 rounded-full", m.dotClass)} aria-hidden />
                                {m.name}
                              </span>
                            </td>
                            <td className="py-2 text-right font-mono tabular-nums">{share?.points ?? 0}</td>
                            <td className="py-2 text-right font-mono tabular-nums">{formatPHP(share?.amount ?? 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t font-semibold">
                      <tr>
                        <td className="py-2">Total</td>
                        <td className="py-2 text-right font-mono tabular-nums">{bill.totalPoints}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{formatPHP(bill.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {bill.total > 0 && (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Worked example: {formatPHP(bill.total)} ÷ {bill.totalPoints} points ≈{" "}
                      <strong>{formatPHP(perPoint)} per point</strong>. Someone with 1.5 points pays about{" "}
                      {formatPHP(Math.round(perPoint * 1.5))}.
                    </p>
                  )}
                </div>
              );
            })
          )}

          <h3 className="mt-6 text-sm font-semibold">Items considered</h3>
          <p className="text-sm text-muted-foreground">What each person&apos;s points are built from:</p>
          <ul className="mt-2 divide-y rounded-lg border text-sm">
            {MERALCO_POINT_ITEMS.map(({ item, points }) => (
              <li key={item} className="flex justify-between px-3 py-2">
                <span>{item}</span>
                <span className="font-mono tabular-nums">{points}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border bg-white px-5 py-2 shadow-xs">
          <FaqAccordion items={faqs} />
        </section>
      </main>
    </div>
  );
}
