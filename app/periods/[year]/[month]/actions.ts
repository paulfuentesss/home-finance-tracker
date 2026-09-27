"use server";

// Server Actions for the month pages. Every change goes through here, which is where the
// rules are enforced: inputs are validated, closed months reject edits, and bill shares
// always add up to the bill total (docs/settlement-rules.md).
//
// ⚠️ There's no auth yet, so anyone who can reach the app can call these. Keep the app
// local / unlisted until login exists.

import { and, asc, desc, eq, gt, inArray, max, or, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  advances,
  billingPeriods,
  billItems,
  billItemShares,
  db,
  members,
  payments,
  periodBalances,
  sharedColumnMembers,
  sharedColumns,
} from "@/db";
import { monthLabel } from "@/lib/format";
import { fromCentavos, parseMoneyInput, splitEqually, sumCentavos, toCentavos, type Centavos } from "@/lib/money";
import { computeBillShares, SettlementError, splitOrder, type MemberId } from "@/lib/settlement";

export type ActionState = { ok: true; redirectTo?: string } | { ok: false; error: string } | null;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

class ActionError extends Error {}

const id = z.coerce.number().int().positive();
// numeric(12,2) holds up to 9,999,999,999.99.
const MAX_CENTAVOS = 999_999_999_999;
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
    if (centavos > MAX_CENTAVOS) {
      ctx.addIssue({ code: "custom", message: "That amount is too large" });
      return z.NEVER;
    }
    return centavos;
  });
const optionalDate = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Choose a valid date")
  .transform((v) => v || null);
// Bills and shared columns pick Equal or Manual; Points is only Meralco's (set by the seed).
const userSplitMode = z.enum(["equal", "manual"]);
const DEFAULT_COLUMN_NAME = "Advances Shared";

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
  total: moneyField(true).optional(),
  paidById: id,
  splitMode: userSplitMode,
});

export async function addBill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(addBillSchema, formData, async ({ periodId, name, total, paidById, splitMode }) => {
    await db.transaction(async (tx) => {
      const { order } = await loadOpenPeriod(tx, periodId);
      if (!order.includes(paidById)) throw new ActionError("The payer isn't in this month.");
      // Manual bills start at ₱0 per person; the total becomes the sum of what's typed.
      const amount = splitMode === "manual" ? 0 : (total ?? 0);
      const [bill] = await tx
        .insert(billItems)
        .values({ periodId, name, totalAmount: fromCentavos(amount), paidById, splitMode })
        .returning({ id: billItems.id });
      await writeShares(tx, bill.id, computeBillShares(splitMode, amount, order), null);
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
  // 0 / missing = the month's default "Advances Shared" column.
  columnId: z.coerce.number().int().nonnegative().default(0),
  payerId: id,
  category: z.enum(["grocery", "food", "service", "misc"], { message: "Choose a category" }),
  description: z.string().trim().min(1, "Enter a description").max(120),
  amount: moneyField(false),
  spentOn: optionalDate,
});

export async function addAdvance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(addAdvanceSchema, formData, async (data) => {
    await db.transaction(async (tx) => {
      const { order } = await loadOpenPeriod(tx, data.periodId);
      if (!order.includes(data.payerId)) throw new ActionError("The payer isn't in this month.");
      const columnId = await resolveColumn(tx, data.periodId, data.columnId, order);
      await tx.insert(advances).values({
        periodId: data.periodId,
        columnId,
        payerId: data.payerId,
        category: data.category,
        description: data.description,
        amount: fromCentavos(data.amount),
        spentOn: data.spentOn,
      });
    });
  });
}

// Editing keeps the advance in its month; changing the column is how it moves between columns.
const updateAdvanceSchema = addAdvanceSchema.omit({ periodId: true }).extend({ advanceId: id });

export async function updateAdvance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(updateAdvanceSchema, formData, async ({ advanceId, ...data }) => {
    await db.transaction(async (tx) => {
      const advance = await tx.query.advances.findFirst({ where: eq(advances.id, advanceId) });
      if (!advance) throw new ActionError("That advance was deleted.");
      const { order } = await loadOpenPeriod(tx, advance.periodId);
      if (!order.includes(data.payerId)) throw new ActionError("The payer isn't in this month.");
      const columnId = await resolveColumn(tx, advance.periodId, data.columnId, order);
      await tx
        .update(advances)
        .set({
          columnId,
          payerId: data.payerId,
          category: data.category,
          description: data.description,
          amount: fromCentavos(data.amount),
          spentOn: data.spentOn,
        })
        .where(eq(advances.id, advanceId));
    });
  });
}

export async function deleteAdvance(advanceId: number): Promise<ActionState> {
  return run(z.object({ advanceId: id }), { advanceId }, async ({ advanceId }) => {
    await db.transaction(async (tx) => {
      const advance = await tx.query.advances.findFirst({ where: eq(advances.id, advanceId) });
      if (!advance) throw new ActionError("That advance was already deleted.");
      await loadOpenPeriod(tx, advance.periodId);
      await tx.delete(advances).where(eq(advances.id, advanceId));
    });
  });
}

// ---------- Shared columns ----------

const addSharedColumnSchema = z.object({
  periodId: id,
  name: z.string().trim().min(1, "Enter a column name").max(60),
  splitMode: userSplitMode,
  sharedMode: z.enum(["all", "except"]).default("all"),
  excluded: z.array(id).default([]),
});

export async function addSharedColumn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const input = { ...Object.fromEntries(formData), excluded: formData.getAll("excluded") };
  return run(addSharedColumnSchema, input, async ({ periodId, name, splitMode, sharedMode, excluded }) => {
    await db.transaction(async (tx) => {
      const { order } = await loadOpenPeriod(tx, periodId);
      const left = new Set(sharedMode === "except" ? excluded : []);
      if (splitMode === "equal" && order.every((m) => left.has(m))) {
        throw new ActionError("At least one person has to share the column.");
      }
      const [column] = await tx
        .insert(sharedColumns)
        .values({ periodId, name, splitMode })
        .returning({ id: sharedColumns.id });
      await tx.insert(sharedColumnMembers).values(
        order.map((memberId) => ({ columnId: column.id, memberId, included: !left.has(memberId) })),
      );
    });
  });
}

export async function setSharedColumnMode(columnId: number, mode: "equal" | "manual"): Promise<ActionState> {
  return run(z.object({ columnId: id, mode: userSplitMode }), { columnId, mode }, async ({ columnId, mode }) => {
    await db.transaction(async (tx) => {
      const { column, order } = await loadColumn(tx, columnId);
      if (column.splitMode === mode) return;
      const total = sumCentavos(column.advances.map((a) => toCentavos(a.amount)));

      if (mode === "manual") {
        // Start from the current equal split so it adds up; then edit anyone's amount.
        const included = order.filter((m) => column.members.some((x) => x.memberId === m && x.included));
        const shares = total > 0 && included.length ? splitEqually(total, included) : new Map<MemberId, Centavos>();
        await upsertColumnMembers(
          tx,
          columnId,
          order.map((memberId) => ({ memberId, amount: fromCentavos(shares.get(memberId) ?? 0) })),
        );
      } else {
        // Back to equal: whoever had an amount shares it (everyone, if nobody did).
        const withAmount = new Set(
          column.members.filter((m) => m.amount !== null && toCentavos(m.amount) > 0).map((m) => m.memberId),
        );
        await upsertColumnMembers(
          tx,
          columnId,
          order.map((memberId) => ({
            memberId,
            amount: null,
            included: withAmount.size === 0 || withAmount.has(memberId),
          })),
        );
      }
      await tx.update(sharedColumns).set({ splitMode: mode }).where(eq(sharedColumns.id, columnId));
    });
  });
}

export async function updateSharedColumnMembers(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const input = { columnId: formData.get("columnId"), included: formData.getAll("included") };
  const schema = z.object({ columnId: id, included: z.array(id).min(1, "At least one person has to share it.") });
  return run(schema, input, async ({ columnId, included }) => {
    await db.transaction(async (tx) => {
      const { order } = await loadColumn(tx, columnId);
      const chosen = new Set(included);
      await upsertColumnMembers(
        tx,
        columnId,
        order.map((memberId) => ({ memberId, included: chosen.has(memberId) })),
      );
    });
  });
}

export async function updateSharedColumnAmount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const schema = z.object({ columnId: id, memberId: id, amount: moneyField(true) });
  return run(schema, formData, async ({ columnId, memberId, amount }) => {
    await db.transaction(async (tx) => {
      const { column, order } = await loadColumn(tx, columnId);
      if (column.splitMode !== "manual") throw new ActionError(`Switch ${column.name} to Manual to type amounts.`);
      if (!order.includes(memberId)) throw new ActionError("That person isn't in this month.");
      await upsertColumnMembers(tx, columnId, [{ memberId, amount: fromCentavos(amount) }]);
    });
  });
}

export async function renameSharedColumn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const schema = z.object({ columnId: id, name: z.string().trim().min(1, "Enter a column name").max(60) });
  return run(schema, formData, async ({ columnId, name }) => {
    await db.transaction(async (tx) => {
      await loadColumn(tx, columnId);
      await tx.update(sharedColumns).set({ name }).where(eq(sharedColumns.id, columnId));
    });
  });
}

export async function deleteSharedColumn(columnId: number): Promise<ActionState> {
  return run(z.object({ columnId: id }), { columnId }, async ({ columnId }) => {
    await db.transaction(async (tx) => {
      const { column } = await loadColumn(tx, columnId);
      if (column.isDefault) throw new ActionError(`${column.name} is the main shared column and stays.`);
      if (column.advances.length > 0) {
        throw new ActionError(
          `${column.name} still has ${column.advances.length} advance(s). Move them to another column (edit the advance) or delete them first.`,
        );
      }
      // shared_column_members rows go with it (ON DELETE CASCADE).
      await tx.delete(sharedColumns).where(eq(sharedColumns.id, columnId));
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
        // Newcomers share the everyday column; manual columns get them at ₱0; situational
        // equal columns (e.g. "w/o PA") are left as they were.
        const columns = await tx.query.sharedColumns.findMany({ where: eq(sharedColumns.periodId, period.id) });
        for (const column of columns) {
          await tx
            .insert(sharedColumnMembers)
            .values({ columnId: column.id, memberId, included: column.isDefault || column.splitMode === "manual" })
            .onConflictDoNothing();
        }
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

      const collector = await tx.query.members.findFirst({
        where: and(eq(members.isCollector, true), eq(members.active, true)),
      });

      for (const period of await openPeriods(tx)) {
        // Anyone with records in a month stays in that month so its numbers don't change.
        if (await hasRecordsIn(tx, period.id, memberId)) continue;
        const inPeriod = await tx.query.periodBalances.findFirst({
          where: and(eq(periodBalances.periodId, period.id), eq(periodBalances.memberId, memberId)),
        });
        if (!inPeriod) continue;
        // ₱0 bills they're down as paying (copied from last month by "Start next month")
        // aren't real payments: hand them to the collector so the member can leave the month.
        const zeroBillsPaid = await tx
          .select({ id: billItems.id })
          .from(billItems)
          .where(
            and(eq(billItems.periodId, period.id), eq(billItems.paidById, memberId), eq(billItems.totalAmount, "0")),
          );
        if (zeroBillsPaid.length) {
          if (!collector) throw new ActionError(`${member.name} is down as paying a bill. Set a collector first.`);
          await tx
            .update(billItems)
            .set({ paidById: collector.id })
            .where(inArray(billItems.id, zeroBillsPaid.map((b) => b.id)));
        }
        const columns = await tx.query.sharedColumns.findMany({
          where: eq(sharedColumns.periodId, period.id),
          with: { members: true, advances: true },
        });
        for (const column of columns) {
          const othersIncluded = column.members.some((m) => m.memberId !== memberId && m.included);
          if (column.splitMode === "equal" && column.advances.length > 0 && !othersIncluded) {
            throw new ActionError(`"${column.name}" is only shared with ${member.name}. Change who shares it first.`);
          }
          await tx
            .delete(sharedColumnMembers)
            .where(and(eq(sharedColumnMembers.columnId, column.id), eq(sharedColumnMembers.memberId, memberId)));
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
      // A second click or tab could get here too; say so plainly instead of a unique-index error.
      const exists = await tx.query.billingPeriods.findFirst({
        where: and(eq(billingPeriods.year, year), eq(billingPeriods.month, month)),
      });
      if (exists) throw new ActionError(`${monthLabel(year, month)} has already been started.`);

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
      // Only the everyday "Advances Shared" column carries over; situational ones are added when needed.
      await ensureDefaultColumn(tx, period.id, order);
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

async function loadColumn(tx: Tx, columnId: number) {
  const column = await tx.query.sharedColumns.findFirst({
    where: eq(sharedColumns.id, columnId),
    with: { members: true, advances: true },
  });
  if (!column) throw new ActionError("That column no longer exists.");
  const { period, order } = await loadOpenPeriod(tx, column.periodId);
  return { column, period, order };
}

/**
 * Sets fields for several members of a column in one statement (insert, or update if the row
 * exists). Every row must carry the same fields; only those fields are updated.
 */
async function upsertColumnMembers(
  tx: Tx,
  columnId: number,
  rows: { memberId: MemberId; included?: boolean; amount?: string | null }[],
) {
  if (rows.length === 0) return;
  const set: { included?: SQL; amount?: SQL } = {};
  if ("included" in rows[0]) set.included = sql.raw(`excluded.${sharedColumnMembers.included.name}`);
  if ("amount" in rows[0]) set.amount = sql.raw(`excluded.${sharedColumnMembers.amount.name}`);
  await tx
    .insert(sharedColumnMembers)
    .values(rows.map((row) => ({ columnId, ...row })))
    .onConflictDoUpdate({ target: [sharedColumnMembers.columnId, sharedColumnMembers.memberId], set });
}

/** The column an advance goes into: one from this month, or 0 = the default column (created if missing). */
async function resolveColumn(tx: Tx, periodId: number, columnId: number, order: MemberId[]): Promise<number> {
  if (!columnId) return ensureDefaultColumn(tx, periodId, order);
  const column = await tx.query.sharedColumns.findFirst({ where: eq(sharedColumns.id, columnId) });
  if (!column || column.periodId !== periodId) throw new ActionError("Choose a column from this month.");
  return columnId;
}

/** The month's everyday "Advances Shared" column (everyone, equal), created if missing. */
async function ensureDefaultColumn(tx: Tx, periodId: number, order: MemberId[]): Promise<number> {
  const existing = await tx.query.sharedColumns.findFirst({
    where: and(eq(sharedColumns.periodId, periodId), eq(sharedColumns.isDefault, true)),
  });
  if (existing) return existing.id;
  const [column] = await tx
    .insert(sharedColumns)
    .values({ periodId, name: DEFAULT_COLUMN_NAME, splitMode: "equal", isDefault: true })
    .returning({ id: sharedColumns.id });
  if (order.length) {
    await tx.insert(sharedColumnMembers).values(order.map((memberId) => ({ columnId: column.id, memberId })));
  }
  return column.id;
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
  // ₱0 bills don't count: they're copied month to month before anyone has paid.
  const [paidBill] = await tx
    .select({ id: billItems.id })
    .from(billItems)
    .where(and(eq(billItems.periodId, periodId), eq(billItems.paidById, memberId), gt(billItems.totalAmount, "0")))
    .limit(1);
  // Removing a typed share from a Manual bill would change that bill's total.
  const [manualBillShare] = await tx
    .select({ id: billItemShares.billItemId })
    .from(billItemShares)
    .innerJoin(billItems, eq(billItems.id, billItemShares.billItemId))
    .where(
      and(
        eq(billItems.periodId, periodId),
        eq(billItems.splitMode, "manual"),
        eq(billItemShares.memberId, memberId),
        gt(billItemShares.amount, "0"),
      ),
    )
    .limit(1);
  const [manualAmount] = await tx
    .select({ id: sharedColumnMembers.columnId })
    .from(sharedColumnMembers)
    .innerJoin(sharedColumns, eq(sharedColumns.id, sharedColumnMembers.columnId))
    .where(
      and(
        eq(sharedColumns.periodId, periodId),
        eq(sharedColumns.splitMode, "manual"),
        eq(sharedColumnMembers.memberId, memberId),
        gt(sharedColumnMembers.amount, "0"),
      ),
    )
    .limit(1);
  return Boolean(advance || payment || paidBill || manualBillShare || manualAmount);
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
