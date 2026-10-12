// Starting the next month (docs/features/months.md): the admin's "Start <month>" button and the
// daily job, which starts it by itself on the 1st (docs/features/reminders.md). One function, so
// both follow the same rules. Callers check who's asking: run("admin", …), or the cron's secret.

import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { billingPeriods, billItems, db, members, periodBalances, sharedColumnMembers, sharedColumns } from "@/db";
import { pointsOf, writeShares, type Tx } from "@/lib/bill-shares";
import { ActionError } from "@/lib/errors";
import { monthLabel } from "@/lib/format";
import { sharesCosts } from "@/lib/members";
import { fromCentavos, toCentavos } from "@/lib/money";
import { monthAfter, startCheck, vanishingBalances } from "@/lib/month-lock";
import { computePeriod, waitingPaymentLabels } from "@/lib/periods";
import { computeBillShares, openingBalancesFrom, splitOrder, type MemberId } from "@/lib/settlement";

export const DEFAULT_COLUMN_NAME = "Advances Shared";

/**
 * Creates the month after the latest one: everyone active (view-only logins aside), the bill
 * columns copied at ₱0, an empty Advances Shared, and balances carried over. Throws an
 * ActionError saying why when it can't: a housemate's "I paid" still waiting, or someone who
 * moved out with an unsettled Final. `dryRun` checks everything and writes nothing (the daily
 * job off the live site — localhost shares the database). Returns the month it started.
 */
export async function startNextMonthIn(tx: Tx, { dryRun = false } = {}): Promise<{ year: number; month: number }> {
  // Locked, so a housemate's "I paid" can't land in it while it stops being the latest.
  const latestId = await lockLatestPeriod(tx);
  if (latestId === null) throw new ActionError("There's no month to continue from yet.");
  const latest = await tx.query.billingPeriods.findFirst({
    where: eq(billingPeriods.id, latestId),
    with: {
      billItems: { with: { shares: true }, orderBy: (b) => [asc(b.id)] },
      balances: { with: { member: true } },
      payments: true,
    },
  });
  if (!latest) throw new ActionError("There's no month to continue from yet.");
  const start = startCheck(waitingPaymentLabels(latest));
  if (!start.ok) throw new ActionError(start.reason!);
  const { year, month } = monthAfter(latest.year, latest.month);
  // A second click or tab could get here too; say so plainly instead of a unique-index error.
  const exists = await tx.query.billingPeriods.findFirst({
    where: and(eq(billingPeriods.year, year), eq(billingPeriods.month, month)),
  });
  if (exists) throw new ActionError(`${monthLabel(year, month)} has already been started.`);

  // Everyone who shares the costs; a view-only login joins no month.
  const activeMembers = (await tx.query.members.findMany({ where: eq(members.active, true) })).filter(sharesCosts);
  const order = splitOrder(activeMembers);
  const collector = activeMembers.find((m) => m.isCollector) ?? activeMembers[0];
  if (!collector) throw new ActionError("Add a household member first.");

  // Someone who moved out with an unsettled Final would silently lose it.
  const computed = await computePeriod(tx, latest.year, latest.month);
  if (computed?.result) {
    const lost = vanishingBalances(openingBalancesFrom(computed.result), new Set(order));
    if (lost.length) {
      const names = computed.result.rows.filter((r) => lost.includes(r.member.id)).map((r) => r.member.name);
      throw new ActionError(
        `${names.join(" and ")} moved out but still ${lost.length === 1 ? "has" : "have"} an unsettled balance in ${monthLabel(latest.year, latest.month)}. Record the payment there first.`,
      );
    }
  }
  if (dryRun) return { year, month };

  // After a closed month the opening balances are stored (live carry-over reads them).
  const closing =
    latest.status === "closed"
      ? new Map(latest.balances.map((b) => [b.memberId, toCentavos(b.closingBalance ?? "0")]))
      : null;

  const [period] = await tx.insert(billingPeriods).values({ year, month }).returning();
  await tx.insert(periodBalances).values(
    order.map((memberId) => ({
      periodId: period.id,
      memberId,
      openingBalance: fromCentavos(closing?.get(memberId) ?? 0),
    })),
  );

  // Copy the bill columns (name, kind, split mode, points, payer) with ₱0 totals, ready to fill in.
  for (const bill of latest.billItems) {
    const paidById = order.includes(bill.paidById) ? bill.paidById : collector.id;
    const [copy] = await tx
      .insert(billItems)
      .values({
        periodId: period.id,
        name: bill.name,
        kind: bill.kind,
        totalAmount: "0",
        paidById,
        splitMode: bill.splitMode,
      })
      .returning({ id: billItems.id });
    let points: Map<MemberId, number> | null = null;
    if (bill.splitMode === "points") {
      points = pointsOf(bill.shares);
      if (order.every((m) => (points!.get(m) ?? 0) === 0)) points = new Map(order.map((m) => [m, 1]));
    }
    const shares = computeBillShares(bill.splitMode, 0, order, { points: points ?? undefined });
    await writeShares(tx, copy.id, shares, points);
  }
  // Only the everyday "Advances Shared" column carries over; situational ones are added when needed.
  await ensureDefaultColumn(tx, period.id, order);
  return { year, month };
}

/**
 * Why the next month can't start right now, in the household's words — or null when it can.
 * A dry run of startNextMonthIn, so the admin's banner gives the same reason the daily job hits.
 * Not a read-only transaction on purpose: the dry run still takes startNextMonthIn's row lock
 * (`FOR UPDATE`), which Postgres refuses in one. It writes nothing and is brief, but a
 * housemate's "I paid" may wait for it. Only runs while the next month is due and not started.
 */
export async function startBlockReason(): Promise<string | null> {
  try {
    await db.transaction((tx) => startNextMonthIn(tx, { dryRun: true }));
    return null;
  } catch (error) {
    if (error instanceof ActionError) return error.message;
    // A banner isn't worth breaking the admin's page for.
    console.error("Couldn't check whether the next month can start", error);
    return null;
  }
}

/** Locks the latest month's row and returns its id (null when there's no month yet). */
async function lockLatestPeriod(tx: Tx): Promise<number | null> {
  const [latest] = await tx
    .select({ id: billingPeriods.id })
    .from(billingPeriods)
    .orderBy(desc(billingPeriods.year), desc(billingPeriods.month))
    .limit(1)
    .for("update");
  return latest?.id ?? null;
}

/** The month's default "Advances Shared" column, created (shared by everyone) if it's missing. */
export async function ensureDefaultColumn(tx: Tx, periodId: number, order: MemberId[]): Promise<number> {
  const existing = await tx.query.sharedColumns.findFirst({
    where: and(eq(sharedColumns.periodId, periodId), eq(sharedColumns.isDefault, true)),
  });
  if (existing) return existing.id;
  // Two people adding the month's first advance at once: the second insert waits for the
  // first, does nothing, and then finds the column the first one made.
  const [column] = await tx
    .insert(sharedColumns)
    .values({ periodId, name: DEFAULT_COLUMN_NAME, splitMode: "equal", isDefault: true })
    .onConflictDoNothing()
    .returning({ id: sharedColumns.id });
  if (!column) {
    const created = await tx.query.sharedColumns.findFirst({
      where: and(eq(sharedColumns.periodId, periodId), eq(sharedColumns.isDefault, true)),
    });
    if (created) return created.id;
    throw new ActionError(`A column named ${DEFAULT_COLUMN_NAME} already exists — rename it in Manage.`);
  }
  if (order.length) {
    await tx.insert(sharedColumnMembers).values(order.map((memberId) => ({ columnId: column.id, memberId })));
  }
  return column.id;
}
