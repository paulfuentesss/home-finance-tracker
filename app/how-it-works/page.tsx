import { ArrowLeft, CalendarCheck, CalendarClock, CalendarPlus, CircleHelp, Lock, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AppShell } from "@/components/app-sidebar";
import { FaqAccordion } from "@/components/faq-accordion";
import { sidebarProps } from "@/components/period-header";
import { getPreview, getPreviewChoices, requireViewer } from "@/lib/auth";
import { monthLabel } from "@/lib/format";
import { paymentFee } from "@/lib/bill-email/fees";
import {
  BILL_EMAIL_COLUMNS,
  HOUSE_BUDGET_LABEL,
  MERALCO_POINT_ITEMS,
  MERALCO_POINTS_AS_OF,
} from "@/lib/household-config";
import { formatPHP } from "@/lib/money";
import { getLatestPointsBills, getPeriodView } from "@/lib/periods";
import { REMINDER_DAYS } from "@/lib/reminders";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "How it works" };

// "Your part each month": a housemate's two jobs, and the emails that remind them
// (docs/features/reminders.md). The days come from REMINDER_DAYS, the same setting the daily job uses.
const YOUR_PART = [
  {
    title: "Log your expenses by the last day",
    body: "Anything you paid for the house — groceries, a service — goes in Advances, and Helper visits you paid in Helper Visits. After the month's last day it locks: you can't add to it or change it anymore. Anything new goes in the next month, which starts by itself on the 1st.",
  },
  {
    title: "Pay when your bill is ready",
    body: `Once the bills are in, the admin emails you your share, and it shows at the top of the month's pages until it's paid. Send it to the ${HOUSE_BUDGET_LABEL}, then tap I paid in Settle Up with the screenshot of your transfer. Amount looks wrong? Message the admin before paying.`,
  },
];

const TIMELINE = [
  { when: `${REMINDER_DAYS.week} days left`, what: "Log what you've paid", icon: CalendarClock },
  { when: `${REMINDER_DAYS.three_days} days left`, what: "It locks soon", icon: CalendarClock },
  { when: "Last day", what: "Log anything left today", icon: CalendarCheck },
  { when: "Month locks", what: "Only the admin can change it", icon: Lock },
  { when: "The 1st", what: "New month starts: log new things there", icon: CalendarPlus },
  { when: "Bill ready", what: "Pay in Settle Up", icon: ReceiptText, highlight: true },
];

// A plain-language guide for the household. Keep it in sync with docs/settlement-rules.md.
export default async function HowItWorksPage() {
  await connection();
  const real = await requireViewer();
  const [{ period, examplePeriod, bills, members }, preview, previewChoices] = await Promise.all([
    getLatestPointsBills(),
    getPreview(),
    getPreviewChoices(),
  ]);
  // Already loaded by getLatestPointsBills (getPeriodView is cached per request).
  const view = period ? await getPeriodView(period.year, period.month) : null;
  const back = period ? `/periods/${period.year}/${period.month}` : "/";
  // The points example uses the latest month with a Meralco amount (getLatestPointsBills).
  const hasAmounts = bills.some((b) => b.total > 0);
  const exampleNote =
    bills.length === 0
      ? null
      : !hasAmounts
        ? "Shares appear once a Meralco bill is in."
        : period && examplePeriod && examplePeriod.id !== period.id
          ? `${monthLabel(period.year, period.month)}'s bill isn't in yet, so the shares are from ${monthLabel(examplePeriod.year, examplePeriod.month)}.`
          : null;
  // From the BILL_PAYMENT_FEES setting, so this page never shows an old fee.
  const feeList = (Object.keys(BILL_EMAIL_COLUMNS) as (keyof typeof BILL_EMAIL_COLUMNS)[])
    .map((provider) => ({ column: BILL_EMAIL_COLUMNS[provider], ...paymentFee(provider) }))
    .filter((f) => f.fee > 0);
  const fees = feeList.map((f) => `${formatPHP(f.fee)} for ${f.column}${f.note ? `, the ${f.note}` : ""}`);

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
            When a bill doesn&apos;t divide evenly, the leftover centavos are handed out one each,{" "}
            <strong>the admin</strong> (who collects) first. Example: ₱1,000.02 split 5 ways is ₱200.004 each, so the
            admin and one other person pay ₱200.01 and the other three pay ₱200.00.
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
      q: "What are shared advances? Why do some columns leave someone out?",
      a: (
        <>
          <p>
            A shared advance is something one person paid for the whole house — groceries, palengke, gas, a service.
            It&apos;s logged into a <strong>shared column</strong>, usually <strong>Advances Shared</strong> (everyone),
            and everyone in that column pays an equal part — including the person who paid, who gets the rest back.
          </p>
          <p>
            When the usual split doesn&apos;t fit, the admin adds a separate column for that month. For example, if
            someone is away for part of the month, what&apos;s bought while they&apos;re gone can go into a column like
            &ldquo;Advances Shared w/o PA&rdquo;, shared only by the people at home.
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
          Switch a shared column to <strong>Manual</strong> and type each person&apos;s amount — for example, when one
          person covers half of a purchase and everyone else splits the rest. If the typed
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
            <li>Positive (e.g. ₱1,250.00): you still need to pay this amount.</li>
            <li>Negative (e.g. −₱3,400.00): you paid more than your share and get this back.</li>
          </ul>
          <p>
            <strong>Final</strong> adds last month&apos;s unsettled balance, takes off any payments already made, and
            spells out what&apos;s left:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium text-rose-600">To pay</span> — pay this amount into the {HOUSE_BUDGET_LABEL}.
            </li>
            <li>
              <span className="font-medium text-emerald-700">To receive</span> — the admin pays this amount back to you
              from the {HOUSE_BUDGET_LABEL}.
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
      q: "Why does the admin usually pay the bills?",
      a: (
        <p>
          The admin pays Meralco, Water, PLDT and usually the Helper upfront, and everyone settles up through the{" "}
          {HOUSE_BUDGET_LABEL} (see the next question). Whoever pays a bill — the admin or anyone else — gets it counted
          as money they paid, so it comes off their Month Final. For the Helper, that&apos;s whoever paid her each time
          (see the Helper question).
        </p>
      ),
    },
    {
      id: "house-budget",
      q: `What is the ${HOUSE_BUDGET_LABEL}?`,
      a: (
        <>
          <p>
            The household&apos;s savings account, where everyone sends what they owe. Once the money is in, the admin
            pays out of it: first to anyone who paid more than their share, then what&apos;s left to the admin, who
            paid the bills upfront.
          </p>
          <p>
            The Split Table shows it as its own row under everyone: what it holds right now, still to be paid out. Money
            only comes off the admin&apos;s Final when it&apos;s paid out to them, so the table always matches where
            the money really is. Everyone&apos;s Final plus what the {HOUSE_BUDGET_LABEL} holds adds up to ₱0.00
            (or the few centavos a Manual column is over or short). Anything still in it at the end of a month
            carries over to the next.
          </p>
        </>
      ),
    },
    {
      id: "helper",
      q: "How does the Helper work? What is early pay?",
      a: (
        <>
          <p>
            Every day the Helper works is logged on the <strong>Helper</strong> tab: the date, her daily pay, and who
            paid her. Whoever is home can pay her and log it themselves.
          </p>
          <p>
            Sometimes she gets money <strong>before</strong> she works — <strong>early pay</strong>. She then owes it,
            and part of her later daily pay is taken off what she owes instead of being handed to her. The Helper tab
            keeps track of what she still owes.
          </p>
          <p>
            <strong>Whoever hands her money gets it back.</strong> The month&apos;s Helper bill is everything handed
            to her that month — daily pay minus what was taken off, plus early pay — split equally like Water and
            PLDT. Each person&apos;s part counts as money they paid, so it comes off their Month Final. Example: pay
            her ₱650 and give ₱1,200 early pay on the same day, and you get ₱1,850 back that month.
          </p>
          <p>
            A month where she gets early pay can cost a bit more than her daily pay; the months when it&apos;s taken
            off cost a bit less. Over time the house pays exactly her pay.
          </p>
        </>
      ),
    },
    {
      id: "emailed-bills",
      q: "What does “Pending” on a bill mean?",
      a: (
        <>
          <p>
            Meralco, Water and PLDT email their bills, and the app reads the amount and due date from the email. The
            bill goes into the month it&apos;s for — the month the provider names on the bill, not the day the email
            arrives — marked <strong>Pending</strong>.
          </p>
          <p>
            The small fee for paying it is added and shared like the bill
            {fees.length > 0 ? `: ${fees.join("; ")}` : ""}. Tap <strong>From email</strong> under the amount to see
            the emailed bill and the fee that was added.
          </p>
          <p>
            A pending bill is <strong>not counted yet</strong>: nobody&apos;s totals change until the admin checks it and taps{" "}
            <strong>Confirm</strong>. The admin can still change the amount first. <strong>Discard</strong> puts the bill back
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
            the bills re-split. A new month&apos;s bill they&apos;re down as paying but that is still ₱0 goes to the admin.
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
          &ldquo;Prev Month Unsettled&rdquo; column and is added to that month&apos;s Final. Money still in the{" "}
          {HOUSE_BUDGET_LABEL} carries over the same way.
        </p>
      ),
    },
    {
      id: "payments",
      q: "How do I record that I paid?",
      a: (
        <>
          <p>
            Send what you owe to the {HOUSE_BUDGET_LABEL}. Then open <strong>Settle Up</strong>, tap{" "}
            <strong>I paid</strong> on your row and attach the screenshot of the transfer. The amount is filled in with
            what you owe; change it if you only paid part. The &ldquo;Your bill is ready&rdquo; email and banner link
            straight there.
          </p>
          <p>
            I paid always goes in the <strong>latest</strong> month. Once the new month has started on the 1st,
            last month&apos;s bill is paid there: what you owed carries over as Prev Month Unsettled, so paying it in the
            new month settles it.
          </p>
          <p>
            It shows as <strong>Waiting for the admin</strong> until they check it arrived and confirm it — until then it
            doesn&apos;t count. If it didn&apos;t arrive, they <strong>reject</strong> it with a short reason (say, not in
            the {HOUSE_BUDGET_LABEL} yet); a rejected payment never counts, and you can cancel it and send it again. You
            can also cancel your own while it&apos;s waiting. Only you and the admin can see your screenshot; the others
            see that you paid and how much.
          </p>
          <p>
            Once confirmed, a payment comes off your Final, adds to what the {HOUSE_BUDGET_LABEL} holds, and shows in the
            Split Table&apos;s Payments column. Pay back everything you owed and your Final goes to ₱0.00 — Settled. The
            admin can also record a payment directly, which counts right away.
          </p>
        </>
      ),
    },
    {
      id: "month-end",
      q: "What happens when the month ends?",
      a: (
        <>
          <p>
            After a month&apos;s last day it&apos;s <strong>locked for housemates</strong>: you can&apos;t add, edit or
            delete your advances or Helper visits in it anymore. The admin still can, until the month is closed — so if
            you forgot something, tell the admin.
          </p>
          <p>
            Anything new goes in the next month, which starts by itself on the 1st. An expense keeps its own date,
            so something from the 30th logged into the next month is fine. Paying isn&apos;t affected: you can still send{" "}
            <strong>I paid</strong> in Settle Up after the month ends — that&apos;s when the bills arrive.
          </p>
        </>
      ),
    },
    {
      id: "emails",
      q: "What emails will I get, and when?",
      a: (
        <>
          <p>My House emails you, around 9am, from the household Gmail:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>{REMINDER_DAYS.week} days</strong> and <strong>{REMINDER_DAYS.three_days} days</strong> before the
              month ends — to log what you&apos;ve paid for the house.
            </li>
            <li>
              <strong>On the last day</strong> — today is the last day to log; from tomorrow the month is locked.
            </li>
            <li>
              <strong>When your bill is ready</strong> — once the bills are in and checked, the admin sends everyone
              their own share: what you owe, any of last month&apos;s still unpaid, any I paid still waiting, and a link
              to Settle Up. Nobody sees anyone else&apos;s amount. If you paid more than your share, it says what you get
              back instead (nothing to do — the admin sends it). Already settled? You get no email.
            </li>
          </ul>
          <p>
            The same reminders show at the top of the month&apos;s pages, so nothing is missed if an email lands in spam.
            &ldquo;Your bill is ready&rdquo; stays there, with a button to Settle Up, until you&apos;re settled — your
            payment confirmed, or, if you&apos;ve since paid for things in the new month, once those cover it (you never
            owe more for a bill than you owe overall).
          </p>
          <p>
            Amount looks wrong, or a question about an email? Message the admin before paying — they can fix the month
            and send the bill again.
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
            see every month. Only emails the admin has added can sign in. The admin can also add someone as{" "}
            <strong>view only</strong> (say, family abroad): they see every month like you do (but not your payment
            screenshots), change nothing, and aren&apos;t part of any month, so they share in no bill and never owe or
            are owed.
          </p>
          <p>
            You can log your own advances into <strong>Advances Shared</strong> and the Helper visits you paid, and edit
            or delete them while they&apos;re there — until the month ends (see{" "}
            <a href="#month-end" className="underline underline-offset-2">
              What happens when the month ends?
            </a>
            ) — and send your own payments to the admin with <strong>I paid</strong>. Everything else —
            bills, points, other shared columns, confirming payments, attaching proof of bills (Receipts), moving in and
            out, closing months — is done by the admin. If one of your advances should be split differently (say, not with
            everyone), the admin moves it to the right column; after that, only the admin can change it.
          </p>
          <p>
            <strong>Billers &amp; Accounts</strong> — account numbers, how each bill is paid, logins — is kept up to date
            by the admin. You see what&apos;s shared with you; passwords stay hidden until you tap to reveal one.
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
            Ending and closing aren&apos;t the same. A month <strong>ends</strong> on its own after its last day, and from
            then only the admin can change it. Later — usually once everyone has paid, but it doesn&apos;t have to wait
            — the admin <strong>closes</strong> it in Settle Up. A closed month is locked: nothing in it
            can be changed (its proofs of payment included), and everyone&apos;s Final is saved as next month&apos;s Prev Month Unsettled. Unpaid
            amounts simply carry over.
          </p>
          <p>
            Months close in order, oldest first — a month can&apos;t be closed while an earlier one is still open, or
            while a bill in it is still pending or a payment is still waiting for the admin. The next month starts by
            itself on the 1st — but not while a payment waits, so nobody is shown the amount again and pays twice; it
            starts the morning after the admin confirms it. If something needs fixing, the admin can{" "}
            <strong>reopen</strong> the latest closed month, fix it, and close it again.
          </p>
        </>
      ),
    },
  ];

  const page = (
    <div className="min-h-full">
      <header className="border-b bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600">
              <CircleHelp className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">How it works</h1>
              <p className="text-sm text-muted-foreground">How My House splits the house costs</p>
            </div>
          </div>
          {/* Phone: just "Back", so it stays on one line and leaves the title its room. */}
          <Link
            href={back}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
            {period && <span className="hidden sm:inline">to {monthLabel(period.year, period.month)}</span>}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
        <section id="your-part" className="rounded-xl border bg-white p-5 shadow-xs">
          <h2 className="font-semibold">Your part each month</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Two things to do. My House emails you a reminder for each, and shows it at the top of the month too.
          </p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {YOUR_PART.map((step, i) => (
              <li key={step.title} className="flex gap-3 rounded-lg border bg-zinc-50/60 p-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-800">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium">{step.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <h3 className="mt-6 text-sm font-semibold">The automatic emails</h3>
          <ol className="mt-3 grid gap-2 sm:grid-cols-3">
            {TIMELINE.map((item) => (
              <li
                key={item.when}
                className={cn(
                  "flex items-start gap-2 rounded-lg border p-3 sm:flex-col sm:gap-1.5",
                  item.highlight && "border-amber-200 bg-amber-50",
                )}
              >
                <item.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground sm:mt-0" />
                <div>
                  <p className="text-sm font-medium">{item.when}</p>
                  <p className="text-xs text-muted-foreground">{item.what}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Sent around 9am from the household Gmail. Questions? Message the admin.{" "}
            <a href="#emails" className="underline underline-offset-2">
              More about the emails
            </a>
          </p>
        </section>

        <section id="points-table" className="rounded-xl border bg-white p-5 shadow-xs">
          <h2 className="font-semibold">Meralco point system</h2>
          <p className="mt-1 text-sm text-muted-foreground">Current allocation as of {MERALCO_POINTS_AS_OF}.</p>
          {exampleNote && <p className="mt-1 text-sm text-muted-foreground">{exampleNote}</p>}

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
                          {examplePeriod ? monthLabel(examplePeriod.year, examplePeriod.month) : ""} share
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
                            <td className="py-2 text-right font-mono tabular-nums">
                              {bill.total > 0 ? formatPHP(share?.amount ?? 0) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t font-semibold">
                      <tr>
                        <td className="py-2">Total</td>
                        <td className="py-2 text-right font-mono tabular-nums">{bill.totalPoints}</td>
                        <td className="py-2 text-right font-mono tabular-nums">
                          {bill.total > 0 ? formatPHP(bill.total) : "—"}
                        </td>
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

  // The same sidebar as the month pages, on the latest month (none yet: just the page).
  if (!view) return page;
  const viewer = preview ?? real;
  return (
    <AppShell viewer={viewer} previewBy={preview ? real : null} sidebar={sidebarProps(view, viewer, previewChoices)}>
      {page}
    </AppShell>
  );
}
