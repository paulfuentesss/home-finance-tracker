// Loads billing periods from the database and shapes them for the UI.
// Everything returned is plain JSON (no Maps) so it can be passed to Client Components.

import "server-only";
import { asc, desc, eq, or } from "drizzle-orm";
import { cache } from "react";
import { billingPeriods, billItems, db, payments, receipts } from "@/db";
import type { Database } from "@/db/client";
import { getPreview, requireViewer } from "@/lib/auth";
import { dateInManila, todayInManila } from "@/lib/format";
import { lastPaidOf, type LastPaid } from "@/lib/last-paid";
import { dotClassOf } from "@/lib/members";
import { canOpenReceipt } from "@/lib/permissions";
import { closeCheck, monthHasEnded, reopenCheck, type LockCheck } from "@/lib/month-lock";
import { payablesOf, type Payables } from "@/lib/reminders";
import {
  countsInBill,
  handedOver,
  helperMonthSummary,
  helperPaidBy,
  ledgerCompare,
  owesAfter,
  type HelperEntryKind,
  type HelperMonthSummary,
} from "@/lib/helper";
import { formatPHP, fromCentavos, sumCentavos, toCentavos, type Centavos } from "@/lib/money";
import {
  computeMonth,
  HOUSE_BUDGET,
  houseBudgetThrough,
  openingBalancesFrom,
  partyFromColumn,
  SettlementError,
  type HouseBudgetMonth,
  type MemberId,
  type MonthInput,
  type MonthResult,
  type Party,
  type SettlementMember,
  type SplitMode,
} from "@/lib/settlement";

export type Category = "grocery" | "food" | "service" | "misc";

export interface PeriodSummary {
  id: number;
  year: number;
  month: number;
}

export interface ViewMember extends SettlementMember {
  dotClass: string;
  /** Their emoji, shown in place of the dot, or null. */
  emoji: string | null;
}

export interface ViewBill {
  id: number;
  name: string;
  /** "helper" = the Helper column (docs/features/helper.md). */
  kind: "standard" | "helper";
  total: Centavos;
  paidById: number;
  /**
   * Set for a Helper column whose month has visits or early pay logged: who handed her money and
   * how much (the total and payers come from the Helper tab). Null = `paidById` paid it all.
   */
  paidBy: { memberId: number; amount: Centavos }[] | null;
  status: "confirmed" | "pending";
  /** "email" = filled in from a bill email. */
  source: "manual" | "email";
  /** The email it came from: the billed amount and the payment fee added (why the total is higher). */
  emailed: { amount: Centavos; fee: Centavos; feeNote: string | null } | null;
  splitMode: SplitMode;
  dueDate: string | null;
  paidOn: string | null;
  /** Keyed by member id (as string, for JSON). */
  shares: Record<string, { amount: Centavos; points: number | null }>;
  /** Sum of points (points mode only). */
  totalPoints: number;
  /** "₱389.73 / person" or "₱1,525.31 / point" (rounded, for display only). */
  perUnit: { amount: Centavos; unit: "person" | "point" } | null;
}

export interface ViewRow {
  memberId: number;
  billShares: Record<string, Centavos>;
  /** Keyed by shared column id (as string). */
  columnShares: Record<string, Centavos>;
  total: Centavos;
  ownAdvances: Centavos;
  billsPaid: Centavos;
  monthFinal: Centavos;
  opening: Centavos;
  paidOut: Centavos;
  received: Centavos;
  balance: Centavos;
}

export interface ViewPayment {
  id: number;
  fromMemberId: Party;
  toMemberId: Party;
  amount: Centavos;
  paidOn: string;
  note: string | null;
  /** "pending" = a housemate's "I paid" waiting for PA; only "confirmed" counts. */
  status: "confirmed" | "pending" | "rejected";
  /** Why PA rejected it (rejected only). */
  rejectedReason: string | null;
}

export interface ViewAdvance {
  id: number;
  payerId: number;
  category: Category;
  description: string;
  amount: Centavos;
  spentOn: string | null;
  columnId: number;
  /** The column's name when it isn't the month's default column. */
  columnTag: string | null;
}

export interface ViewColumn {
  id: number;
  name: string;
  splitMode: "equal" | "manual";
  isDefault: boolean;
  /** Sum of the advances logged into it. */
  total: Centavos;
  /** Manual: typed amounts − total (0 when it adds up). */
  difference: Centavos;
  /** Equal: who shares it. */
  includedIds: number[];
  /** Manual: typed amount per member id (as string). */
  amounts: Record<string, Centavos | null>;
}

export interface ViewHelperEntry {
  id: number;
  kind: HelperEntryKind;
  payerId: number | null;
  onDate: string | null;
  /** Daily pay, early pay, or the carried-over debt. */
  amount: Centavos;
  deduction: Centavos;
  note: string | null;
  handedOver: Centavos;
  /** Her debt after this entry (all months, in order), like the sheet's "Remaining". */
  owesAfter: Centavos;
}

export interface ViewHelper {
  /** The month's Helper column (null when the month has none yet). */
  billId: number | null;
  /** This month's entries in ledger order (`ledgerCompare`: starting debt first, then by date). */
  entries: ViewHelperEntry[];
  summary: HelperMonthSummary;
  /** Her debt before this month's first entry. */
  owesAtStart: Centavos;
  /** Her debt now, after every month's entries. */
  owesNow: Centavos;
  /** Whether her debt from the Google Sheet has been entered (in any month). */
  hasOpening: boolean;
}

export interface PeriodView {
  period: PeriodSummary & {
    status: "open" | "closed";
    /** Manila calendar date it was closed ("YYYY-MM-DD"). */
    closedOn: string | null;
    /**
     * Its last day has passed (Manila), so housemates can't change it anymore — only the admin,
     * until it's closed (monthHasEnded). Worked out here, never from the browser's clock.
     */
    ended: boolean;
  };
  members: ViewMember[];
  bills: ViewBill[];
  /** Shared-advances columns ("Advances Shared", "… w/o PA", "Ice Maker Adj."). */
  columns: ViewColumn[];
  rows: ViewRow[];
  /** The collection account's month (docs/settlement-rules.md → House Budget). */
  houseBudget: HouseBudgetMonth;
  /** The House Budget's emoji, shown in place of its icon (set on the Manage page), or null. */
  houseBudgetEmoji: string | null;
  advances: ViewAdvance[];
  payments: ViewPayment[];
  helper: ViewHelper;
  stats: { coreBills: Centavos; sharedAdvances: Centavos };
  periods: PeriodSummary[];
  prev: PeriodSummary | null;
  next: PeriodSummary | null;
  isLatest: boolean;
  /** The latest month's status (the deadline banner is about it, whichever month is shown). */
  latestStatus: "open" | "closed";
  canClose: LockCheck;
  canReopen: LockCheck;
  /** Set when the numbers can't be computed (e.g. shares that don't add up). */
  issue: string | null;
  /**
   * What each member still has to pay or get back for this month, by member id (payablesIn: the
   * Final, less their waiting "I paid"s and what was paid in later months, capped by their latest
   * Final), the same as the bill banner and email say. Missing for someone the numbers can't be worked out for. The greeting.
   */
  payables: Record<string, Payables>;
  /**
   * When each housemate (not the collector) last paid, by member id, across every month, not just
   * this one (lastPaidOf). Missing when there's no payment on record. The greeting.
   */
  lastPaid: Record<string, LastPaid>;
  /** Settle Up on the latest month, where "I paid" goes (components/settle-up.tsx). */
  latestSettleHref: string;
}

/** The app's `db` or a transaction (Server Actions pass `tx` for a consistent snapshot). */
export type Executor = Pick<Database, "query">;

const loadPeriods = (executor: Executor = db) =>
  executor.query.billingPeriods.findMany({
    orderBy: [asc(billingPeriods.year), asc(billingPeriods.month)],
    with: {
      balances: { with: { member: true } },
      billItems: { with: { shares: true, emails: true }, orderBy: (b) => [asc(b.id)] },
      sharedColumns: { with: { members: true }, orderBy: (c) => [asc(c.id)] },
      advances: { orderBy: (a) => [asc(a.spentOn), asc(a.id)] },
      payments: { orderBy: (p) => [asc(p.paidOn), asc(p.id)] },
      // Put into ledger order with ledgerCompare where it matters (helperViewOf).
      helperEntries: { orderBy: (h) => [asc(h.onDate), asc(h.id)] },
    },
  });

type LoadedPeriod = Awaited<ReturnType<typeof loadPeriods>>[number];

// Page reads go through getLatestPeriod / getPeriodView / getLatestPointsBills, and each one
// requires a signed-in member first (lib/auth.ts). computePeriod is also used by actions,
// which check the caller in run().

export async function getLatestPeriod(): Promise<PeriodSummary | null> {
  await requireViewer();
  const [latest] = await db
    .select({ id: billingPeriods.id, year: billingPeriods.year, month: billingPeriods.month })
    .from(billingPeriods)
    .orderBy(desc(billingPeriods.year), desc(billingPeriods.month))
    .limit(1);
  return latest ?? null;
}

/**
 * Every month up to `year`/`month`, with that month's numbers computed (null when it doesn't
 * exist). Used by the pages and by Server Actions that need a month's Finals (closing a month,
 * removing someone).
 */
export async function computePeriod(executor: Executor, year: number, month: number) {
  // The whole history is small (a handful of rows per month), and carry-over needs every
  // earlier month anyway, so load it in one query.
  const all = await loadPeriods(executor);
  const index = all.findIndex((p) => p.year === year && p.month === month);
  if (index === -1) return null;

  // Live carry-over: each month opens with the previous month's Final. The first month,
  // and any month after a closed one, uses its stored opening balances instead.
  let opening = new Map<MemberId, Centavos>();
  let result: MonthResult | null = null;
  let issue: string | null = null;
  for (let i = 0; i <= index; i++) {
    const period = all[i];
    if (i === 0 || all[i - 1].status === "closed") {
      opening = new Map(period.balances.map((b) => [b.memberId, toCentavos(b.openingBalance)]));
      // Stored balances don't depend on earlier months, so an earlier problem no longer matters.
      issue = null;
    }
    try {
      result = computeMonth(toMonthInput(period, opening));
      opening = openingBalancesFrom(result);
    } catch (error) {
      if (!(error instanceof SettlementError)) throw error;
      const label = `${period.year}-${String(period.month).padStart(2, "0")}`;
      issue = i === index ? error.message : `Carry-over from ${label} couldn't be computed: ${error.message}`;
      result = null;
      opening = new Map();
    }
  }
  // The House Budget carries over from payments alone, from the first month (houseBudgetThrough).
  const houseBudget = houseBudgetThrough(all.slice(0, index + 1).map(paymentsOf));
  return { all, index, period: all[index], result, issue, houseBudget };
}

export type ComputedPeriod = NonNullable<Awaited<ReturnType<typeof computePeriod>>>;

/** A computed month plus everyone's Final in the latest month, for what's still owed (payablesIn). */
export type PayablesPeriod = ComputedPeriod & {
  /** Each member's live Final in the latest month (empty when it can't be worked out). */
  latestFinals: ReadonlyMap<MemberId, Centavos>;
};

/** computePeriod for a month whose bill is (or will be) emailed, with the latest month's Finals. */
export async function computeForPayables(executor: Executor, year: number, month: number): Promise<PayablesPeriod | null> {
  const computed = await computePeriod(executor, year, month);
  if (!computed) return null;
  const last = computed.all[computed.all.length - 1];
  const latest = last.id === computed.period.id ? computed : await computePeriod(executor, last.year, last.month);
  // Only Finals that are whole: with an `issue`, a later month may have been computed without an
  // earlier month's carry-over, and capping by it could call someone settled who isn't.
  const rows = latest && !latest.issue ? (latest.result?.rows ?? []) : [];
  const latestFinals = new Map(rows.map((r) => [r.member.id, r.balance]));
  return { ...computed, latestFinals };
}

/**
 * What a member still has to pay (or get back) for a month (docs/settlement-rules.md → "What's
 * still owed after a bill email"): its Final, less their waiting "I paid"s and what moved between
 * them and the House Budget in later months — but never more than they owe (or are owed)
 * overall now, their latest Final, since a later month's own numbers can settle it too. Null
 * when they aren't in it or the numbers can't be worked out. `carriedOver` = what's still unpaid
 * of their Prev Month Unsettled, after their payments since.
 */
export function payablesIn(
  computed: PayablesPeriod,
  memberId: MemberId,
): { payables: Payables; carriedOver: Centavos } | null {
  const row = computed.result?.rows.find((r) => r.member.id === memberId);
  if (!row) return null;
  const payments = computed.all.slice(computed.index).flatMap((period, i) =>
    paymentsOf(period).flatMap((p) => {
      const direction =
        p.fromMemberId === memberId && p.toMemberId === HOUSE_BUDGET
          ? ("in" as const)
          : p.fromMemberId === HOUSE_BUDGET && p.toMemberId === memberId
            ? ("out" as const)
            : null;
      return direction ? [{ amount: toCentavos(p.amount), status: p.status, later: i > 0, direction }] : [];
    }),
  );
  // Last month's unpaid amount, less what they've paid in since (this month or later).
  const paidIn = sumCentavos(payments.filter((p) => p.direction === "in" && p.status === "confirmed").map((p) => p.amount));
  return {
    payables: payablesOf(row.balance, payments, computed.latestFinals.get(memberId)),
    carriedOver: Math.max(0, row.opening - paidIn),
  };
}

/** A month's payments with each side as a Party (a NULL side is the House Budget). */
function paymentsOf(period: LoadedPeriod) {
  return period.payments.map((p) => ({
    ...p,
    fromMemberId: partyFromColumn(p.fromMemberId),
    toMemberId: partyFromColumn(p.toMemberId),
  }));
}

/**
 * One month, fully computed. Wrapped in React `cache()` so the layout and the tab page
 * share a single database round trip per request.
 */
export const getPeriodView = cache(async (year: number, month: number): Promise<PeriodView | null> => {
  await requireViewer();
  // With the latest month's Finals too, so the greeting's "still to pay" (payables below) is
  // capped the same way as the bill banner's. Viewing the latest month costs nothing extra.
  const [computed, settings] = await Promise.all([
    computeForPayables(db, year, month),
    db.query.householdSettings.findFirst(),
  ]);
  if (!computed) return null;
  const { all, index, period, result, issue, houseBudget } = computed;

  // Field by field, never a spread: member rows hold login details (email, auth_user_id) that
  // must not reach the browser.
  const members = periodMembers(period).map((m) => ({
    id: m.id,
    name: m.name,
    sortOrder: m.sortOrder,
    isCollector: m.isCollector,
    dotClass: dotClassOf(m),
    emoji: m.emoji,
  }));
  const summaries = all.map(({ id, year, month }) => ({ id, year, month }));

  const bills: ViewBill[] = period.billItems.map((b) => {
    const total = toCentavos(b.totalAmount);
    const totalPoints = b.shares.reduce((sum, s) => sum + (s.points === null ? 0 : Number(s.points)), 0);
    const perUnit =
      b.splitMode === "equal" && members.length > 0
        ? { amount: Math.round(total / members.length), unit: "person" as const }
        : b.splitMode === "points" && totalPoints > 0
          ? { amount: Math.round(total / totalPoints), unit: "point" as const }
          : null;
    const payers = b.kind === "helper" ? helperPayersOf(period) : undefined;
    return {
      id: b.id,
      name: b.name,
      kind: b.kind,
      total,
      paidById: b.paidById,
      paidBy: payers ? payers.map((p) => ({ memberId: p.memberId, amount: toCentavos(p.amount) })) : null,
      status: b.status,
      source: b.source,
      emailed: emailedOf(b.emails),
      splitMode: b.splitMode,
      dueDate: b.dueDate,
      paidOn: b.paidOn,
      shares: Object.fromEntries(
        b.shares.map((s) => [
          String(s.memberId),
          { amount: toCentavos(s.amount), points: s.points === null ? null : Number(s.points) },
        ]),
      ),
      totalPoints,
      perUnit,
    };
  });

  const columns: ViewColumn[] = period.sharedColumns.map((c) => {
    const computed = result?.columns.find((r) => r.id === c.id);
    const includedIds = members.filter((m) => c.members.some((x) => x.memberId === m.id && x.included)).map((m) => m.id);
    return {
      id: c.id,
      name: c.name,
      splitMode: c.splitMode === "manual" ? "manual" : "equal",
      isDefault: c.isDefault,
      total:
        computed?.total ??
        sumCentavos(period.advances.filter((a) => a.columnId === c.id).map((a) => toCentavos(a.amount))),
      difference: computed?.difference ?? 0,
      includedIds,
      amounts: Object.fromEntries(
        c.members.map((m) => [String(m.memberId), m.amount === null ? null : toCentavos(m.amount)]),
      ),
    };
  });
  const columnById = new Map(columns.map((c) => [c.id, c]));
  // Manila's date, from the server, so the browser's clock never decides it.
  const today = todayInManila();
  const allPayments = all.flatMap(paymentsOf);

  return {
    period: {
      id: period.id,
      year: period.year,
      month: period.month,
      status: period.status,
      closedOn: period.closedAt ? dateInManila(period.closedAt) : null,
      ended: monthHasEnded(period.year, period.month, today),
    },
    members,
    bills,
    columns,
    rows: (result?.rows ?? []).map((r) => ({
      memberId: r.member.id,
      billShares: mapToRecord(r.billShares),
      columnShares: mapToRecord(r.columnShares),
      total: r.total,
      ownAdvances: r.ownAdvances,
      billsPaid: r.billsPaid,
      monthFinal: r.monthFinal,
      opening: r.opening,
      paidOut: r.paidOut,
      received: r.received,
      balance: r.balance,
    })),
    houseBudget,
    advances: period.advances.map((a) => ({
      id: a.id,
      payerId: a.payerId,
      category: a.category,
      description: a.description,
      amount: toCentavos(a.amount),
      spentOn: a.spentOn,
      columnId: a.columnId,
      columnTag: columnById.get(a.columnId)?.isDefault === false ? columnById.get(a.columnId)!.name : null,
    })),
    payments: period.payments.map((p) => ({
      id: p.id,
      fromMemberId: partyFromColumn(p.fromMemberId),
      toMemberId: partyFromColumn(p.toMemberId),
      amount: toCentavos(p.amount),
      paidOn: p.paidOn,
      note: p.note,
      status: p.status,
      rejectedReason: p.rejectedReason,
    })),
    helper: helperViewOf(all, index),
    stats: {
      coreBills: sumCentavos(bills.filter((b) => b.status === "confirmed").map((b) => b.total)),
      sharedAdvances: sumCentavos(period.advances.map((a) => toCentavos(a.amount))),
    },
    periods: summaries,
    prev: summaries[index - 1] ?? null,
    next: summaries[index + 1] ?? null,
    isLatest: index === all.length - 1,
    latestStatus: all[all.length - 1].status,
    canClose: closeCheck(period, all[index - 1] ?? null, issue, pendingBillNames(period), waitingPaymentLabels(period)),
    canReopen: reopenCheck(period, all[index + 1] ?? null),
    issue,
    payables: Object.fromEntries(
      members.flatMap((m) => {
        const owed = payablesIn(computed, m.id);
        return owed ? [[String(m.id), owed.payables]] : [];
      }),
    ),
    lastPaid: Object.fromEntries(
      members
        .filter((m) => !m.isCollector)
        .flatMap((m) => {
          const last = lastPaidOf(allPayments, m.id, today);
          return last ? [[String(m.id), last]] : [];
        }),
    ),
    latestSettleHref: `/periods/${all[all.length - 1].year}/${all[all.length - 1].month}/settle`,
    houseBudgetEmoji: settings?.houseBudgetEmoji ?? null,
  };
});

export interface ViewReceipt {
  id: number;
  /** Exactly one of these is set. */
  billItemId: number | null;
  paymentId: number | null;
  contentType: string;
  originalName: string | null;
}

/**
 * A month's receipts (bills and payments), oldest first — only the ones the page's viewer may
 * open: a payment's proof is for PA and the people in it (canOpenReceipt). Separate
 * from getPeriodView, whose query loads every month: only the Receipts and Settle Up tabs need
 * these.
 */
export async function getPeriodReceipts(periodId: number): Promise<ViewReceipt[]> {
  const viewer = await requireViewer();
  // Filtered for whoever the page is drawn for, so a preview shows what that housemate sees.
  // (The /receipts/<id> route checks the real viewer.)
  const drawnFor = (await getPreview()) ?? viewer;
  const rows = await db
    .select({
      id: receipts.id,
      billItemId: receipts.billItemId,
      paymentId: receipts.paymentId,
      contentType: receipts.contentType,
      originalName: receipts.originalName,
      paymentFrom: payments.fromMemberId,
      paymentTo: payments.toMemberId,
    })
    .from(receipts)
    .leftJoin(billItems, eq(billItems.id, receipts.billItemId))
    .leftJoin(payments, eq(payments.id, receipts.paymentId))
    .where(or(eq(billItems.periodId, periodId), eq(payments.periodId, periodId)))
    .orderBy(asc(receipts.id));
  return rows
    .filter((r) =>
      canOpenReceipt(drawnFor, {
        payment:
          r.paymentId === null
            ? null
            : { fromMemberId: partyFromColumn(r.paymentFrom), toMemberId: partyFromColumn(r.paymentTo) },
      }),
    )
    .map((r) => ({
      id: r.id,
      billItemId: r.billItemId,
      paymentId: r.paymentId,
      contentType: r.contentType,
      originalName: r.originalName,
    }));
}

// How many months back the "How it works" example looks for a points bill with an amount.
const POINTS_EXAMPLE_LOOKBACK = 3;

/**
 * Points-mode bills for the "How it works" example. `period` is the latest month (the page's Back
 * link and sidebar); `examplePeriod` is the newest of the last few months whose points bill has an
 * amount, so the example isn't all ₱0.00 while this month's Meralco bill isn't in yet. When none
 * has one, the example is the latest month.
 */
export async function getLatestPointsBills() {
  await requireViewer();
  const recent = await db
    .select({ id: billingPeriods.id, year: billingPeriods.year, month: billingPeriods.month })
    .from(billingPeriods)
    .orderBy(desc(billingPeriods.year), desc(billingPeriods.month))
    .limit(POINTS_EXAMPLE_LOOKBACK);
  const latest = recent[0];
  if (!latest) {
    return { period: null, examplePeriod: null, bills: [] as ViewBill[], members: [] as ViewMember[] };
  }

  const pointsBillsOf = async (p: PeriodSummary) => {
    const view = await getPeriodView(p.year, p.month);
    return {
      examplePeriod: p,
      bills: (view?.bills ?? []).filter((b) => b.splitMode === "points"),
      members: view?.members ?? [],
    };
  };
  for (const p of recent) {
    const example = await pointsBillsOf(p);
    if (example.bills.some((b) => b.total > 0)) return { period: latest, ...example };
  }
  // getPeriodView is cached per request, so this reuses the latest month's view.
  return { period: latest, ...(await pointsBillsOf(latest)) };
}

function emailedOf(emails: LoadedPeriod["billItems"][number]["emails"]): ViewBill["emailed"] {
  const email = emails.find((e) => e.status === "imported" && e.amount !== null);
  if (!email) return null;
  return {
    amount: toCentavos(email.amount!),
    fee: email.fee === null ? 0 : toCentavos(email.fee),
    feeNote: email.feeNote,
  };
}

export function pendingBillNames(period: LoadedPeriod): string[] {
  return period.billItems.filter((b) => b.status === "pending").map((b) => b.name);
}

/** A housemate's "I paid" still waiting for PA, as "Ben ₱1,000.00" (lib/month-lock.ts). */
export function waitingPaymentLabels(period: Pick<LoadedPeriod, "payments" | "balances">): string[] {
  const nameOf = new Map(period.balances.map((b) => [b.memberId, b.member.name]));
  return period.payments
    .filter((p) => p.status === "pending")
    .map((p) => `${(p.fromMemberId !== null && nameOf.get(p.fromMemberId)) || "Someone"} ${formatPHP(toCentavos(p.amount))}`);
}

export function periodMembers(period: LoadedPeriod) {
  return period.balances.map((b) => b.member).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

/**
 * Who paid the month's Helper bill, from its visits and early pay — undefined when none are
 * logged (her starting debt doesn't count), so a Helper column filled in the old way (a typed
 * total, one payer) still works.
 */
function helperPayersOf(period: LoadedPeriod): { memberId: number; amount: string }[] | undefined {
  const entries = period.helperEntries.filter(countsInBill);
  if (entries.length === 0) return undefined;
  return [...helperPaidBy(entries)].map(([memberId, amount]) => ({ memberId, amount: fromCentavos(amount) }));
}

function helperViewOf(all: LoadedPeriod[], index: number): ViewHelper {
  const period = all[index];
  const months = all.map((p) => p.helperEntries.toSorted(ledgerCompare));
  const ledger = months.flat();
  const after = owesAfter(ledger);
  const lastBefore = months.slice(0, index).flat().at(-1);
  const lastOverall = ledger.at(-1);
  return {
    billId: period.billItems.find((b) => b.kind === "helper")?.id ?? null,
    entries: months[index].map((e) => ({
      id: e.id,
      kind: e.kind,
      payerId: e.payerId,
      onDate: e.onDate,
      amount: toCentavos(e.amount),
      deduction: toCentavos(e.deduction),
      note: e.note,
      handedOver: handedOver(e),
      owesAfter: after.get(e.id)!,
    })),
    summary: helperMonthSummary(period.helperEntries),
    owesAtStart: lastBefore ? after.get(lastBefore.id)! : 0,
    owesNow: lastOverall ? after.get(lastOverall.id)! : 0,
    hasOpening: ledger.some((e) => e.kind === "opening"),
  };
}

function toMonthInput(period: LoadedPeriod, opening: Map<MemberId, Centavos>): MonthInput {
  const helperPayers = helperPayersOf(period);
  return {
    members: periodMembers(period),
    bills: period.billItems.map((b) => (b.kind === "helper" && helperPayers ? { ...b, paidBy: helperPayers } : b)),
    billShares: new Map(period.billItems.map((b) => [b.id, b.shares])),
    sharedColumns: period.sharedColumns.map((c) => ({
      id: c.id,
      name: c.name,
      splitMode: c.splitMode === "manual" ? "manual" : "equal",
      members: c.members,
    })),
    advances: period.advances,
    payments: paymentsOf(period),
    openingBalances: opening,
  };
}

function mapToRecord<K extends string | number>(map: Map<K, Centavos>): Record<string, Centavos> {
  return Object.fromEntries([...map].map(([k, v]) => [String(k), v]));
}
