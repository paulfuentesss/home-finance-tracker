"use server";

// Server Actions for the month pages. Every change goes through here, which is where the
// rules are enforced: the caller must be signed in with the right role (run("admin" | "member",
// …), docs/features/auth.md), inputs are validated, closed months reject edits, and bill
// shares always add up to the bill total (docs/settlement-rules.md).
//
// Server Actions are public endpoints: anyone can call them with any arguments. Never skip
// run(), and never trust ids or payers sent from the page — check them here.

import { and, asc, desc, eq, gt, inArray, max, or, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  advances,
  billEmails,
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
import { getViewer } from "@/lib/auth";
import { placeBill } from "@/lib/bill-import";
import { pointsFor, pointsOf, writeShares, type Tx } from "@/lib/bill-shares";
import { ActionError, isUniqueViolation } from "@/lib/errors";
import { monthLabel } from "@/lib/format";
import { inviteMember, uninviteMember } from "@/lib/invites";
import { fromCentavos, parseMoneyInput, splitEqually, sumCentavos, toCentavos, type Centavos } from "@/lib/money";
import { closeCheck, reopenCheck, vanishingBalances } from "@/lib/month-lock";
import { canManageAdvance, isAdmin, type Role, type Viewer } from "@/lib/permissions";
import { computePeriod, pendingBillNames, periodMembers } from "@/lib/periods";
import {
  computeBillShares,
  openingBalancesFrom,
  SettlementError,
  splitOrder,
  type MemberId,
} from "@/lib/settlement";
import { authAdmin } from "@/lib/supabase/admin-server";

export type ActionState = { ok: true; redirectTo?: string } | { ok: false; error: string } | null;

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
  return run("admin", z.object({ billId: id, total: moneyField(true) }), formData, async ({ billId, total }) => {
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
  return run("admin", pointsSchema, formData, async ({ billId, memberId, points }) => {
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
  return run("admin", schema, formData, async ({ billId, memberId, amount }) => {
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
  return run("admin", schema, formData, async ({ billId, field, value }) => {
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
  return run("admin", addBillSchema, formData, async ({ periodId, name, total, paidById, splitMode }) => {
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
  return run("admin", schema, formData, async ({ billId, name }) => {
    await db.transaction(async (tx) => {
      await loadBill(tx, billId);
      await tx.update(billItems).set({ name }).where(eq(billItems.id, billId));
    });
  });
}

export async function deleteBill(billId: number): Promise<ActionState> {
  return run("admin", z.object({ billId: id }), { billId }, async ({ billId }) => {
    await db.transaction(async (tx) => {
      await loadBill(tx, billId);
      // An email that filled this column goes back to the Bill inbox.
      await tx
        .update(billEmails)
        .set({ status: "unmatched", reason: "Its bill column was deleted.", billItemId: null })
        .where(eq(billEmails.billItemId, billId));
      // bill_item_shares rows go with it (ON DELETE CASCADE).
      await tx.delete(billItems).where(eq(billItems.id, billId));
    });
  });
}

// ---------- Emailed bills (docs/settlement-rules.md → "Email-imported bills") ----------

/** A pending (emailed) bill starts counting. */
export async function confirmBill(billId: number): Promise<ActionState> {
  return run("admin", z.object({ billId: id }), { billId }, async ({ billId }) => {
    await db.transaction(async (tx) => {
      const { bill } = await loadBill(tx, billId);
      if (bill.status !== "pending") throw new ActionError(`${bill.name} is already confirmed.`);
      const shares = sumCentavos(bill.shares.map((s) => toCentavos(s.amount)));
      if (shares !== toCentavos(bill.totalAmount)) {
        throw new ActionError(`${bill.name}'s shares don't add up to its total. Re-enter the total, then confirm.`);
      }
      await tx.update(billItems).set({ status: "confirmed" }).where(eq(billItems.id, billId));
    });
  });
}

/** Undoes an emailed bill: the column goes back to ₱0 and the email is set aside for good. */
export async function discardEmailBill(billId: number): Promise<ActionState> {
  return run("admin", z.object({ billId: id }), { billId }, async ({ billId }) => {
    await db.transaction(async (tx) => {
      const { bill, order } = await loadBill(tx, billId);
      if (bill.status !== "pending") throw new ActionError(`${bill.name} is confirmed; change its amount instead.`);
      // Split mode and points stay; the shares are rewritten at ₱0 so they still add up.
      const points = bill.splitMode === "points" ? pointsFor(bill.shares, order) : null;
      const shares = computeBillShares(bill.splitMode, 0, order, { points: points ?? undefined });
      await tx
        .update(billItems)
        .set({ totalAmount: "0", dueDate: null, source: "manual", status: "confirmed" })
        .where(eq(billItems.id, billId));
      await writeShares(tx, billId, shares, points);
      await tx
        .update(billEmails)
        .set({ status: "dismissed", reason: "Discarded from the Split Table.", billItemId: null })
        .where(eq(billEmails.billItemId, billId));
    });
  });
}

/** Tries an inbox email again (e.g. after starting or reopening its month). */
export async function retryBillEmail(emailId: number): Promise<ActionState> {
  return run("admin", z.object({ emailId: id }), { emailId }, async ({ emailId }) => {
    const outcome = await db.transaction(async (tx) => {
      const email = await tx.query.billEmails.findFirst({ where: eq(billEmails.id, emailId) });
      if (!email || email.status !== "unmatched") throw new ActionError("That email is no longer in the inbox.");
      return placeBill(tx, email);
    });
    if (outcome.kind === "unmatched") {
      // The new reason is saved; refresh so the inbox shows it, and say it here too.
      revalidatePath("/", "layout");
      throw new ActionError(outcome.reason);
    }
  });
}

export async function dismissBillEmail(emailId: number): Promise<ActionState> {
  return run("admin", z.object({ emailId: id }), { emailId }, async ({ emailId }) => {
    const [email] = await db
      .update(billEmails)
      .set({ status: "dismissed" })
      .where(and(eq(billEmails.id, emailId), eq(billEmails.status, "unmatched")))
      .returning({ id: billEmails.id });
    if (!email) throw new ActionError("That email is no longer in the inbox.");
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

// Members may add, edit and delete their own advances in the default column; PA, any advance
// (lib/permissions.ts → canManageAdvance). For a member the payer and column are forced here,
// whatever the form sent.

/** A member's advances are always theirs and always in the default column (0). */
function forMember<T extends { payerId: number; columnId: number }>(data: T, viewer: Viewer): T {
  return isAdmin(viewer) ? data : { ...data, payerId: viewer.memberId, columnId: 0 };
}

export async function addAdvance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run("member", addAdvanceSchema, formData, async (input, viewer) => {
    const data = forMember(input, viewer);
    await db.transaction(async (tx) => {
      const { order } = await loadOpenPeriod(tx, data.periodId);
      if (!order.includes(data.payerId)) {
        throw new ActionError(isAdmin(viewer) ? "The payer isn't in this month." : "You're not in this month.");
      }
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
  return run("member", updateAdvanceSchema, formData, async ({ advanceId, ...input }, viewer) => {
    const data = forMember(input, viewer);
    await db.transaction(async (tx) => {
      const advance = await loadAdvanceFor(tx, advanceId, viewer, "That advance was deleted.");
      const { order } = await loadOpenPeriod(tx, advance.periodId);
      if (!order.includes(data.payerId)) throw new ActionError("The payer isn't in this month.");
      const columnId = await resolveColumn(tx, advance.periodId, data.columnId, order);
      const [updated] = await tx
        .update(advances)
        .set({
          columnId,
          payerId: data.payerId,
          category: data.category,
          description: data.description,
          amount: fromCentavos(data.amount),
          spentOn: data.spentOn,
        })
        .where(and(eq(advances.id, advanceId), unchangedFor(viewer, advance)))
        .returning({ id: advances.id });
      if (!updated) throw new ActionError("That advance just changed. Refresh and try again.");
    });
  });
}

export async function deleteAdvance(advanceId: number): Promise<ActionState> {
  return run("member", z.object({ advanceId: id }), { advanceId }, async ({ advanceId }, viewer) => {
    await db.transaction(async (tx) => {
      const advance = await loadAdvanceFor(tx, advanceId, viewer, "That advance was already deleted.");
      await loadOpenPeriod(tx, advance.periodId);
      const [deleted] = await tx
        .delete(advances)
        .where(and(eq(advances.id, advanceId), unchangedFor(viewer, advance)))
        .returning({ id: advances.id });
      if (!deleted) throw new ActionError("That advance just changed. Refresh and try again.");
    });
  });
}

/** Loads an advance the viewer is allowed to change (with its column, to know if it's the default). */
async function loadAdvanceFor(tx: Tx, advanceId: number, viewer: Viewer, missing: string) {
  const advance = await tx.query.advances.findFirst({
    where: eq(advances.id, advanceId),
    with: { column: { columns: { isDefault: true } } },
  });
  if (!advance) throw new ActionError(missing);
  if (!canManageAdvance(viewer, { payerId: advance.payerId, inDefaultColumn: advance.column.isDefault })) {
    throw new ActionError("Only PA can change this advance.");
  }
  return advance;
}

/**
 * For a member, the write only goes through if the advance is still theirs and still in the
 * column it was checked in — so PA moving it at the same moment can't be undone.
 */
function unchangedFor(viewer: Viewer, advance: { payerId: number; columnId: number }): SQL | undefined {
  if (isAdmin(viewer)) return undefined;
  return and(eq(advances.payerId, viewer.memberId), eq(advances.columnId, advance.columnId));
}

// ---------- Payments ----------

// Money actually changing hands to settle up (usually someone ↔ the collector).
const paymentSchema = z.object({
  fromMemberId: id,
  toMemberId: id,
  amount: moneyField(false),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date it was paid"),
  note: z
    .string()
    .trim()
    .max(120, "Keep the note under 120 characters")
    .optional()
    .transform((v) => v || null),
});

type PaymentInput = z.output<typeof paymentSchema>;

function checkPaymentMembers(order: MemberId[], data: PaymentInput) {
  if (data.fromMemberId === data.toMemberId) throw new ActionError("Pick two different people.");
  if (!order.includes(data.fromMemberId) || !order.includes(data.toMemberId)) {
    throw new ActionError("Both people have to be in this month.");
  }
}

export async function addPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run("admin", paymentSchema.extend({ periodId: id }), formData, async ({ periodId, ...data }) => {
    await db.transaction(async (tx) => {
      const { order } = await loadOpenPeriod(tx, periodId);
      checkPaymentMembers(order, data);
      await tx.insert(payments).values({ periodId, ...data, amount: fromCentavos(data.amount) });
    });
  });
}

export async function updatePayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run("admin", paymentSchema.extend({ paymentId: id }), formData, async ({ paymentId, ...data }) => {
    await db.transaction(async (tx) => {
      const payment = await tx.query.payments.findFirst({ where: eq(payments.id, paymentId) });
      if (!payment) throw new ActionError("That payment was deleted.");
      const { order } = await loadOpenPeriod(tx, payment.periodId);
      checkPaymentMembers(order, data);
      await tx
        .update(payments)
        .set({ ...data, amount: fromCentavos(data.amount) })
        .where(eq(payments.id, paymentId));
    });
  });
}

export async function deletePayment(paymentId: number): Promise<ActionState> {
  return run("admin", z.object({ paymentId: id }), { paymentId }, async ({ paymentId }) => {
    await db.transaction(async (tx) => {
      const payment = await tx.query.payments.findFirst({ where: eq(payments.id, paymentId) });
      if (!payment) throw new ActionError("That payment was already deleted.");
      await loadOpenPeriod(tx, payment.periodId);
      await tx.delete(payments).where(eq(payments.id, paymentId));
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
  return run("admin", addSharedColumnSchema, input, async ({ periodId, name, splitMode, sharedMode, excluded }) => {
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
  return run("admin", z.object({ columnId: id, mode: userSplitMode }), { columnId, mode }, async ({ columnId, mode }) => {
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
  return run("admin", schema, input, async ({ columnId, included }) => {
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
  return run("admin", schema, formData, async ({ columnId, memberId, amount }) => {
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
  return run("admin", schema, formData, async ({ columnId, name }) => {
    await db.transaction(async (tx) => {
      await loadColumn(tx, columnId);
      await tx.update(sharedColumns).set({ name }).where(eq(sharedColumns.id, columnId));
    });
  });
}

export async function deleteSharedColumn(columnId: number): Promise<ActionState> {
  return run("admin", z.object({ columnId: id }), { columnId }, async ({ columnId }) => {
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
  return run("admin", schema, formData, async ({ name }) => {
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
  return run("admin", z.object({ memberId: id }), { memberId }, async ({ memberId }) => {
    // Returns the login they had, deleted below once the removal has committed.
    const oldLogin = await db.transaction(async (tx) => {
      // Locked, so an invite saved at the same moment can't leave a stale login behind.
      const [member] = await tx.select().from(members).where(eq(members.id, memberId)).for("update");
      if (!member || !member.active) throw new ActionError("That person was already removed.");
      if (member.isCollector) throw new ActionError(`${member.name} is the collector and can't be removed.`);
      const active = await tx.select({ id: members.id }).from(members).where(eq(members.active, true));
      if (active.length <= 1) throw new ActionError("At least one person has to stay in the household.");

      // Deactivated: left out of future months, history kept. Their login goes too, so
      // someone re-added later needs a fresh invite.
      await tx
        .update(members)
        .set({ active: false, email: null, authUserId: null })
        .where(eq(members.id, memberId));

      const collector = await tx.query.members.findFirst({
        where: and(eq(members.isCollector, true), eq(members.active, true)),
      });

      for (const period of await openPeriods(tx)) {
        // Anyone with records in a month stays in that month so its numbers don't change.
        if (await hasRecordsIn(tx, period.id, memberId)) continue;
        // So does anyone who carried an unsettled balance into it, or that money would vanish.
        // (If the month can't be computed, keep them to be safe.)
        const computed = await computePeriod(tx, period.year, period.month);
        const row = computed?.result?.rows.find((r) => r.member.id === memberId);
        if (!computed?.result || (row && row.opening !== 0)) continue;
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
      return member.authUserId;
    });
    // Best effort: they're already locked out (no member row matches the login any more).
    if (oldLogin) await deleteLoginQuietly(oldLogin);
  });
}

/**
 * Invites someone to log in (docs/features/auth.md), changes their login email, or — with an
 * empty email — un-invites them. PA's own login is changed with `npm run auth:invite`, so a
 * typo here can't lock him out.
 */
export async function updateMemberEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const schema = z.object({ memberId: id, email: z.string().trim().toLowerCase().max(254) });
  return run("admin", schema, formData, async ({ memberId, email }, viewer) => {
    if (memberId === viewer.memberId) {
      throw new ActionError("Change your own login with npm run auth:invite, so a typo can't lock you out.");
    }
    if (email === "") {
      await uninviteMember(db, authAdmin(), memberId);
    } else {
      if (!z.email().safeParse(email).success) throw new ActionError("Enter an email like name@example.com");
      await inviteMember(db, authAdmin(), memberId, email);
    }
  });
}

async function deleteLoginQuietly(authUserId: string) {
  try {
    const { error } = await authAdmin().deleteUser(authUserId);
    if (error) console.error("Couldn't delete a removed member's login", error);
  } catch (error) {
    console.error("Couldn't delete a removed member's login", error);
  }
}

// ---------- Months ----------

export async function startNextMonth(): Promise<ActionState> {
  return run("admin", z.object({}), {}, async () => {
    let path = "";
    await db.transaction(async (tx) => {
      const latest = await tx.query.billingPeriods.findFirst({
        orderBy: [desc(billingPeriods.year), desc(billingPeriods.month)],
        with: { billItems: { with: { shares: true }, orderBy: (b) => [asc(b.id)] }, balances: true },
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

/**
 * Locks a month: saves everyone's Final as their closing balance and, when the next month
 * exists, as its opening balance. Unpaid amounts carry over (docs/settlement-rules.md).
 */
export async function closeMonth(periodId: number): Promise<ActionState> {
  return run("admin", z.object({ periodId: id }), { periodId }, async ({ periodId }) => {
    await db.transaction(async (tx) => {
      const target = await tx.query.billingPeriods.findFirst({ where: eq(billingPeriods.id, periodId) });
      if (!target) throw new ActionError("That month no longer exists.");
      const computed = await computePeriod(tx, target.year, target.month);
      if (!computed) throw new ActionError("That month no longer exists.");
      const { all, index, period, result, issue } = computed;
      const check = closeCheck(period, all[index - 1] ?? null, issue, pendingBillNames(period));
      if (!check.ok || !result) throw new ActionError(check.reason ?? "This month can't be closed yet.");

      const finals = openingBalancesFrom(result);
      const next = all[index + 1] ?? null;
      const lost = vanishingBalances(finals, next ? new Set(next.balances.map((b) => b.memberId)) : null);
      if (next && lost.length) {
        const names = periodMembers(period).filter((m) => lost.includes(m.id)).map((m) => m.name);
        throw new ActionError(
          `${names.join(" and ")} ${lost.length === 1 ? "isn't" : "aren't"} in ${monthLabel(next.year, next.month)} but still ${lost.length === 1 ? "has" : "have"} an unsettled balance. Record the payment first.`,
        );
      }

      for (const [memberId, balance] of finals) {
        await tx
          .update(periodBalances)
          .set({ closingBalance: fromCentavos(balance) })
          .where(and(eq(periodBalances.periodId, periodId), eq(periodBalances.memberId, memberId)));
      }
      await tx
        .update(billingPeriods)
        .set({ status: "closed", closedAt: new Date() })
        .where(eq(billingPeriods.id, periodId));
      if (next) {
        for (const b of next.balances) {
          await tx
            .update(periodBalances)
            .set({ openingBalance: fromCentavos(finals.get(b.memberId) ?? 0) })
            .where(and(eq(periodBalances.periodId, next.id), eq(periodBalances.memberId, b.memberId)));
        }
      }
    });
  });
}

/** Unlocks a month. The next month goes back to live carry-over on its own. */
export async function reopenMonth(periodId: number): Promise<ActionState> {
  return run("admin", z.object({ periodId: id }), { periodId }, async ({ periodId }) => {
    await db.transaction(async (tx) => {
      const all = await tx.query.billingPeriods.findMany({
        orderBy: [asc(billingPeriods.year), asc(billingPeriods.month)],
      });
      const index = all.findIndex((p) => p.id === periodId);
      if (index === -1) throw new ActionError("That month no longer exists.");
      const check = reopenCheck(all[index], all[index + 1] ?? null);
      if (!check.ok) throw new ActionError(check.reason!);
      await tx.update(billingPeriods).set({ status: "open", closedAt: null }).where(eq(billingPeriods.id, periodId));
      await tx.update(periodBalances).set({ closingBalance: null }).where(eq(periodBalances.periodId, periodId));
    });
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
    const points = pointsFor(bill.shares, order);
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

/**
 * Checks who's calling, validates input, runs the change, refreshes the pages, and turns
 * errors into messages. `access` is required: "admin" for PA-only changes, "member" for the
 * few anyone signed in may make (the action then checks ownership itself).
 */
async function run<S extends z.ZodType>(
  access: Role,
  schema: S,
  input: FormData | Record<string, unknown>,
  fn: (data: z.output<S>, viewer: Viewer) => Promise<string | void>,
): Promise<ActionState> {
  // First, and outside the try/catch below, so redirect() isn't swallowed. Strangers get no
  // validation messages either.
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (access === "admin" && !isAdmin(viewer)) return { ok: false, error: "Only PA can change this." };

  const parsed = schema.safeParse(input instanceof FormData ? Object.fromEntries(input) : input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  let redirectTo: string | undefined;
  try {
    redirectTo = (await fn(parsed.data, viewer)) || undefined;
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
