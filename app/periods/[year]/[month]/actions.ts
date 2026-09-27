"use server";

// Server Actions for the month pages. Every change goes through here, which is where the
// rules are enforced: inputs are validated, closed months reject edits, and bill shares
// always add up to the bill total (docs/settlement-rules.md).
//
// ⚠️ There's no auth yet, so anyone who can reach the app can call these. Keep the app
// local / unlisted until login exists.

import { and, asc, desc, eq, inArray, max, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  advances,
  advanceShares,
  billingPeriods,
  billItems,
  billItemShares,
  db,
  members,
  payments,
  periodBalances,
} from "@/db";
import { fromCentavos, parseMoneyInput, sumCentavos, toCentavos, type Centavos } from "@/lib/money";
import {
  computeBillShares,
  normalizeSharedWith,
  SettlementError,
  splitOrder,
  type MemberId,
  type SplitMode,
} from "@/lib/settlement";

export type ActionState = { ok: true; redirectTo?: string } | { ok: false; error: string } | null;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

class ActionError extends Error {}

const id = z.coerce.number().int().positive();
const moneyField = (allowZero: boolean) =>
  z.string().transform((raw, ctx): Centavos => {
    const centavos = parseMoneyInput(raw);
    if (centavos === null || centavos < 0 || (!allowZero && centavos === 0)) {
      ctx.addIssue({
        code: "custom",
        message: allowZero ? "Enter an amount like 2,699.00 (0 is fine)" : "Enter an amount greater than 0, like 2,699.00",
      });
      return z.NEVER;
    }
    return centavos;
  });
const optionalDate = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Choose a valid date")
  .transform((v) => v || null);
const splitMode = z.enum(["equal", "points", "manual"]);

// ---------- Bills ----------

export async function updateBillTotal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(z.object({ billId: id, total: moneyField(true) }), formData, async ({ billId, total }) => {
    await db.transaction(async (tx) => {
      const { bill, order } = await loadBill(tx, billId);
      if (bill.splitMode === "manual") {
        throw new ActionError(`${bill.name} is split manually — edit each person's share instead.`);
      }
      const points = pointsOf(bill.shares);
      const shares = computeBillShares(bill.splitMode, total, order, { points });
      await tx.update(billItems).set({ totalAmount: fromCentavos(total) }).where(eq(billItems.id, billId));
      await writeShares(tx, billId, shares, bill.splitMode === "points" ? points : null);
    });
  });
}

export async function setBillSplitMode(billId: number, mode: SplitMode): Promise<ActionState> {
  return run(z.object({ billId: id, mode: splitMode }), { billId, mode }, async ({ billId, mode }) => {
    await db.transaction(async (tx) => {
      const { bill, order, period } = await loadBill(tx, billId);
      if (bill.splitMode === mode) return;
      const total = toCentavos(bill.totalAmount);

      if (mode === "manual") {
        // Keep everyone's current amount; from now on the total is the sum of the shares.
        await tx.update(billItems).set({ splitMode: "manual" }).where(eq(billItems.id, billId));
        await tx.update(billItemShares).set({ points: null }).where(eq(billItemShares.billItemId, billId));
        return;
      }

      let points: Map<MemberId, number> | undefined;
      if (mode === "points") {
        // Start from last month's points for the same bill, otherwise 1 point each.
        points = await previousMonthPoints(tx, period, bill.name);
        if (!points || order.every((m) => (points!.get(m) ?? 0) === 0)) {
          points = new Map(order.map((m) => [m, 1]));
        }
      }
      const shares = computeBillShares(mode, total, order, { points });
      await tx.update(billItems).set({ splitMode: mode }).where(eq(billItems.id, billId));
      await writeShares(tx, billId, shares, points ?? null);
    });
  });
}

const pointsSchema = z.object({
  billId: id,
  memberId: id,
  points: z.coerce
    .number({ message: "Enter points like 1.5" })
    .min(0, "Points can't be negative")
    .max(999, "That's a lot of points")
    .transform((p) => Math.round(p * 100) / 100),
});

export async function updateBillPoints(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(pointsSchema, formData, async ({ billId, memberId, points }) => {
    await db.transaction(async (tx) => {
      const { bill, order } = await loadBill(tx, billId);
      if (bill.splitMode !== "points") throw new ActionError(`${bill.name} isn't split by points.`);
      if (!order.includes(memberId)) throw new ActionError("That person isn't in this month.");
      const allPoints = pointsOf(bill.shares);
      allPoints.set(memberId, points);
      const shares = computeBillShares("points", toCentavos(bill.totalAmount), order, { points: allPoints });
      await writeShares(tx, billId, shares, allPoints);
    });
  });
}

export async function updateBillShare(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const schema = z.object({ billId: id, memberId: id, amount: moneyField(true) });
  return run(schema, formData, async ({ billId, memberId, amount }) => {
    await db.transaction(async (tx) => {
      const { bill, order } = await loadBill(tx, billId);
      if (bill.splitMode !== "manual") throw new ActionError(`Switch ${bill.name} to Manual to edit shares.`);
      if (!order.includes(memberId)) throw new ActionError("That person isn't in this month.");
      const manual = new Map(bill.shares.map((s) => [s.memberId, toCentavos(s.amount)]));
      manual.set(memberId, amount);
      const shares = computeBillShares("manual", 0, order, { manual });
      // Manual mode: the bill total follows the shares.
      await tx
        .update(billItems)
        .set({ totalAmount: fromCentavos(sumCentavos(shares.values())) })
        .where(eq(billItems.id, billId));
      await writeShares(tx, billId, shares, null);
    });
  });
}

export async function updateBillDates(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const schema = z.object({ billId: id, field: z.enum(["dueDate", "paidOn"]), value: optionalDate });
  return run(schema, formData, async ({ billId, field, value }) => {
    await db.transaction(async (tx) => {
      await loadBill(tx, billId);
      await tx.update(billItems).set({ [field]: value }).where(eq(billItems.id, billId));
    });
  });
}

const addBillSchema = z.object({
  periodId: id,
  name: z.string().trim().min(1, "Enter a bill name").max(60),
  total: moneyField(true),
  paidById: id,
});

export async function addBill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(addBillSchema, formData, async ({ periodId, name, total, paidById }) => {
    await db.transaction(async (tx) => {
      const { order } = await loadOpenPeriod(tx, periodId);
      if (!order.includes(paidById)) throw new ActionError("The payer isn't in this month.");
      const [bill] = await tx
        .insert(billItems)
        .values({ periodId, name, totalAmount: fromCentavos(total), paidById, splitMode: "equal" })
        .returning({ id: billItems.id });
      await writeShares(tx, bill.id, computeBillShares("equal", total, order), null);
    });
  });
}

export async function renameBill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const schema = z.object({ billId: id, name: z.string().trim().min(1, "Enter a bill name").max(60) });
  return run(schema, formData, async ({ billId, name }) => {
    await db.transaction(async (tx) => {
      await loadBill(tx, billId);
      await tx.update(billItems).set({ name }).where(eq(billItems.id, billId));
    });
  });
}

export async function deleteBill(billId: number): Promise<ActionState> {
  return run(z.object({ billId: id }), { billId }, async ({ billId }) => {
    await db.transaction(async (tx) => {
      await loadBill(tx, billId);
      // bill_item_shares rows go with it (ON DELETE CASCADE).
      await tx.delete(billItems).where(eq(billItems.id, billId));
    });
  });
}

// ---------- Advances ----------

const addAdvanceSchema = z.object({
  periodId: id,
  payerId: id,
  category: z.enum(["grocery", "food", "service", "misc"], { message: "Choose a category" }),
  description: z.string().trim().min(1, "Enter a description").max(120),
  amount: moneyField(false),
  spentOn: optionalDate,
  sharedMode: z.enum(["all", "except"]).default("all"),
  excluded: z.array(id).default([]),
});

export async function addAdvance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const input = { ...Object.fromEntries(formData), excluded: formData.getAll("excluded") };
  return run(addAdvanceSchema, input, async (data) => {
    await db.transaction(async (tx) => {
      const { order } = await loadOpenPeriod(tx, data.periodId);
      if (!order.includes(data.payerId)) throw new ActionError("The payer isn't in this month.");
      const excluded = new Set(data.sharedMode === "except" ? data.excluded : []);
      if (data.sharedMode === "except" && excluded.size === 0) {
        throw new ActionError("Tick who's left out, or choose Everyone.");
      }
      const sharedWith = normalizeSharedWith(
        excluded.size ? order.filter((m) => !excluded.has(m)) : null,
        order,
      );
      await tx.insert(advances).values({
        periodId: data.periodId,
        payerId: data.payerId,
        category: data.category,
        description: data.description,
        amount: fromCentavos(data.amount),
        spentOn: data.spentOn,
        sharedWith,
      });
    });
  });
}

export async function deleteAdvance(advanceId: number): Promise<ActionState> {
  return run(z.object({ advanceId: id }), { advanceId }, async ({ advanceId }) => {
    await db.transaction(async (tx) => {
      const advance = await tx.query.advances.findFirst({ where: eq(advances.id, advanceId) });
      if (!advance) throw new ActionError("That advance was already deleted.");
      await loadOpenPeriod(tx, advance.periodId);
      // advance_shares rows (custom splits) are removed by ON DELETE CASCADE.
      await tx.delete(advances).where(eq(advances.id, advanceId));
    });
  });
}

// ---------- Members ----------

export async function addMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const schema = z.object({ name: z.string().trim().min(1, "Enter a name").max(40) });
  return run(schema, formData, async ({ name }) => {
    await db.transaction(async (tx) => {
      const existing = await tx.query.members.findFirst({ where: eq(members.name, name) });
      let memberId: number;
      if (existing?.active) throw new ActionError(`${name} is already in the household.`);
      if (existing) {
        // Someone who moved out and came back keeps their history.
        await tx.update(members).set({ active: true }).where(eq(members.id, existing.id));
        memberId = existing.id;
      } else {
        const [{ top }] = await tx.select({ top: max(members.sortOrder) }).from(members);
        const [row] = await tx
          .insert(members)
          .values({ name, sortOrder: (top ?? 0) + 1 })
          .returning({ id: members.id });
        memberId = row.id;
      }
      for (const period of await openPeriods(tx)) {
        await tx.insert(periodBalances).values({ periodId: period.id, memberId }).onConflictDoNothing();
        await resplitPeriodBills(tx, period.id);
      }
    });
  });
}

export async function removeMember(memberId: number): Promise<ActionState> {
  return run(z.object({ memberId: id }), { memberId }, async ({ memberId }) => {
    await db.transaction(async (tx) => {
      const member = await tx.query.members.findFirst({ where: eq(members.id, memberId) });
      if (!member || !member.active) throw new ActionError("That person was already removed.");
      if (member.isCollector) throw new ActionError(`${member.name} is the collector and can't be removed.`);
      const active = await tx.select({ id: members.id }).from(members).where(eq(members.active, true));
      if (active.length <= 1) throw new ActionError("At least one person has to stay in the household.");

      // Deactivated: left out of future months, history kept.
      await tx.update(members).set({ active: false }).where(eq(members.id, memberId));

      for (const period of await openPeriods(tx)) {
        // Anyone with records in a month stays in that month so its numbers don't change.
        if (await hasRecordsIn(tx, period.id, memberId)) continue;
        const inPeriod = await tx.query.periodBalances.findFirst({
          where: and(eq(periodBalances.periodId, period.id), eq(periodBalances.memberId, memberId)),
        });
        if (!inPeriod) continue;
        const remaining = (await periodOrder(tx, period.id)).filter((m) => m !== memberId);
        for (const advance of await tx.query.advances.findMany({ where: eq(advances.periodId, period.id) })) {
          if (!advance.sharedWith?.includes(memberId)) continue;
          const left = advance.sharedWith.filter((m) => m !== memberId);
          if (left.length === 0) {
            throw new ActionError(`"${advance.description}" is only shared with ${member.name}. Edit it first.`);
          }
          await tx
            .update(advances)
            .set({ sharedWith: normalizeSharedWith(left, remaining) })
            .where(eq(advances.id, advance.id));
        }
        const billIds = (
          await tx.select({ id: billItems.id }).from(billItems).where(eq(billItems.periodId, period.id))
        ).map((b) => b.id);
        if (billIds.length) {
          await tx
            .delete(billItemShares)
            .where(and(inArray(billItemShares.billItemId, billIds), eq(billItemShares.memberId, memberId)));
        }
        await tx
          .delete(periodBalances)
          .where(and(eq(periodBalances.periodId, period.id), eq(periodBalances.memberId, memberId)));
        await resplitPeriodBills(tx, period.id);
      }
    });
  });
}

// ---------- Months ----------

export async function startNextMonth(): Promise<ActionState> {
  return run(z.object({}), {}, async () => {
    let path = "";
    await db.transaction(async (tx) => {
      const latest = await tx.query.billingPeriods.findFirst({
        orderBy: [desc(billingPeriods.year), desc(billingPeriods.month)],
        with: { billItems: { with: { shares: true }, orderBy: (b) => [asc(b.id)] } },
      });
      if (!latest) throw new ActionError("There's no month to continue from yet.");
      const year = latest.month === 12 ? latest.year + 1 : latest.year;
      const month = latest.month === 12 ? 1 : latest.month + 1;

      const activeMembers = await tx.query.members.findMany({ where: eq(members.active, true) });
      const order = splitOrder(activeMembers);
      const collector = activeMembers.find((m) => m.isCollector) ?? activeMembers[0];
      if (!collector) throw new ActionError("Add a household member first.");

      const [period] = await tx.insert(billingPeriods).values({ year, month }).returning();
      await tx.insert(periodBalances).values(order.map((memberId) => ({ periodId: period.id, memberId })));

      // Copy the bill columns (name, split mode, points, payer) with ₱0 totals, ready to fill in.
      for (const bill of latest.billItems) {
        const paidById = order.includes(bill.paidById) ? bill.paidById : collector.id;
        const [copy] = await tx
          .insert(billItems)
          .values({ periodId: period.id, name: bill.name, totalAmount: "0", paidById, splitMode: bill.splitMode })
          .returning({ id: billItems.id });
        let points: Map<MemberId, number> | null = null;
        if (bill.splitMode === "points") {
          points = pointsOf(bill.shares);
          if (order.every((m) => (points!.get(m) ?? 0) === 0)) points = new Map(order.map((m) => [m, 1]));
        }
        const shares = computeBillShares(bill.splitMode, 0, order, { points: points ?? undefined });
        await writeShares(tx, copy.id, shares, points);
      }
      path = `/periods/${year}/${month}`;
    });
    return path;
  });
}

// ---------- Helpers ----------

async function loadOpenPeriod(tx: Tx, periodId: number) {
  const period = await tx.query.billingPeriods.findFirst({
    where: eq(billingPeriods.id, periodId),
    with: { balances: { with: { member: true } } },
  });
  if (!period) throw new ActionError("That month no longer exists.");
  if (period.status !== "open") throw new ActionError("This month is closed, so it can't be changed.");
  // Leftover centavos go to the collector first (see splitOrder).
  return { period, order: splitOrder(period.balances.map((b) => b.member)) };
}

async function loadBill(tx: Tx, billId: number) {
  const bill = await tx.query.billItems.findFirst({ where: eq(billItems.id, billId), with: { shares: true } });
  if (!bill) throw new ActionError("That bill no longer exists.");
  const { period, order } = await loadOpenPeriod(tx, bill.periodId);
  return { bill, period, order };
}

async function periodOrder(tx: Tx, periodId: number): Promise<MemberId[]> {
  const balances = await tx.query.periodBalances.findMany({
    where: eq(periodBalances.periodId, periodId),
    with: { member: true },
  });
  return splitOrder(balances.map((b) => b.member));
}

function openPeriods(tx: Tx) {
  return tx.query.billingPeriods.findMany({ where: eq(billingPeriods.status, "open") });
}

function pointsOf(shares: { memberId: number; points: string | null }[]): Map<MemberId, number> {
  return new Map(shares.map((s) => [s.memberId, s.points === null ? 0 : Number(s.points)]));
}

async function previousMonthPoints(tx: Tx, period: { year: number; month: number }, billName: string) {
  const earlier = await tx.query.billingPeriods.findMany({
    orderBy: [desc(billingPeriods.year), desc(billingPeriods.month)],
    with: { billItems: { with: { shares: true } } },
  });
  const previous = earlier.find((p) => p.year * 12 + p.month < period.year * 12 + period.month);
  const bill = previous?.billItems.find((b) => b.name === billName && b.splitMode === "points");
  return bill ? pointsOf(bill.shares) : undefined;
}

/** Replaces a bill's shares (and points, in points mode). */
async function writeShares(
  tx: Tx,
  billItemId: number,
  shares: Map<MemberId, Centavos>,
  points: ReadonlyMap<MemberId, number> | null,
) {
  await tx.delete(billItemShares).where(eq(billItemShares.billItemId, billItemId));
  if (shares.size === 0) return;
  await tx.insert(billItemShares).values(
    [...shares].map(([memberId, amount]) => ({
      billItemId,
      memberId,
      amount: fromCentavos(amount),
      points: points ? String(points.get(memberId) ?? 0) : null,
    })),
  );
}

/** Re-splits every bill in a month after its members change. */
async function resplitPeriodBills(tx: Tx, periodId: number) {
  const order = await periodOrder(tx, periodId);
  const bills = await tx.query.billItems.findMany({ where: eq(billItems.periodId, periodId), with: { shares: true } });
  for (const bill of bills) {
    if (bill.splitMode === "manual") {
      // Keep everyone's amounts; newcomers start at ₱0 and the total stays the sum.
      const manual = new Map(bill.shares.map((s) => [s.memberId, toCentavos(s.amount)]));
      const shares = computeBillShares("manual", 0, order, { manual });
      await tx
        .update(billItems)
        .set({ totalAmount: fromCentavos(sumCentavos(shares.values())) })
        .where(eq(billItems.id, bill.id));
      await writeShares(tx, bill.id, shares, null);
      continue;
    }
    const points = pointsOf(bill.shares);
    if (bill.splitMode === "points" && order.every((m) => (points.get(m) ?? 0) === 0)) {
      order.forEach((m) => points.set(m, 1));
    }
    const shares = computeBillShares(bill.splitMode, toCentavos(bill.totalAmount), order, { points });
    await writeShares(tx, bill.id, shares, bill.splitMode === "points" ? points : null);
  }
}

/** Whether a member has anything recorded in a month (then they can't leave it). */
async function hasRecordsIn(tx: Tx, periodId: number, memberId: number): Promise<boolean> {
  const [advance] = await tx
    .select({ id: advances.id })
    .from(advances)
    .where(and(eq(advances.periodId, periodId), eq(advances.payerId, memberId)))
    .limit(1);
  const [payment] = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(eq(payments.periodId, periodId), or(eq(payments.fromMemberId, memberId), eq(payments.toMemberId, memberId))),
    )
    .limit(1);
  const [paidBill] = await tx
    .select({ id: billItems.id })
    .from(billItems)
    .where(and(eq(billItems.periodId, periodId), eq(billItems.paidById, memberId)))
    .limit(1);
  const [customShare] = await tx
    .select({ id: advanceShares.advanceId })
    .from(advanceShares)
    .innerJoin(advances, eq(advances.id, advanceShares.advanceId))
    .where(and(eq(advances.periodId, periodId), eq(advanceShares.memberId, memberId)))
    .limit(1);
  return Boolean(advance || payment || paidBill || customShare);
}

/** Validates input, runs the change, refreshes the pages, and turns errors into messages. */
async function run<S extends z.ZodType>(
  schema: S,
  input: FormData | Record<string, unknown>,
  fn: (data: z.output<S>) => Promise<string | void>,
): Promise<ActionState> {
  const parsed = schema.safeParse(input instanceof FormData ? Object.fromEntries(input) : input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  let redirectTo: string | undefined;
  try {
    redirectTo = (await fn(parsed.data)) || undefined;
  } catch (error) {
    if (error instanceof ActionError || error instanceof SettlementError) {
      return { ok: false, error: error.message };
    }
    if (isUniqueViolation(error)) return { ok: false, error: "That name is already used this month." };
    console.error(error);
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true, redirectTo };
}

function isUniqueViolation(error: unknown): boolean {
  // postgres-js errors carry the SQLSTATE code; Drizzle may wrap them in `cause`.
  const code = (e: unknown) => (e as { code?: string } | null)?.code;
  return code(error) === "23505" || code((error as { cause?: unknown } | null)?.cause) === "23505";
}
