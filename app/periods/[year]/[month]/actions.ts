"use server";

// Server Actions for the month page. Every change goes through here, which is where the
// rules are enforced: inputs are validated, closed months reject edits, and bill shares
// are re-split so they always add up to the bill total (docs/settlement-rules.md).
//
// ⚠️ There's no auth yet, so anyone who can reach the app can call these. Keep the app
// local / unlisted until login exists.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { advances, billingPeriods, billItems, billItemShares, db } from "@/db";
import { fromCentavos, parseMoneyInput, splitEqually, toCentavos, type Centavos } from "@/lib/money";
import { resplitBill, SettlementError, splitOrder } from "@/lib/settlement";

export type ActionState = { ok: true } | { ok: false; error: string } | null;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

class ActionError extends Error {}

const id = z.coerce.number().int().positive();
const money = z.string().transform((raw, ctx): Centavos => {
  const centavos = parseMoneyInput(raw);
  if (centavos === null || centavos <= 0) {
    ctx.addIssue({ code: "custom", message: "Enter an amount greater than 0, like 2,699.00" });
    return z.NEVER;
  }
  return centavos;
});

// ---------- Bills ----------

const updateBillTotalSchema = z.object({ billId: id, total: money });

export async function updateBillTotal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(updateBillTotalSchema, formData, async ({ billId, total }) => {
    await db.transaction(async (tx) => {
      const bill = await tx.query.billItems.findFirst({
        where: eq(billItems.id, billId),
        with: { shares: true },
      });
      if (!bill) throw new ActionError("That bill no longer exists.");
      const { order } = await loadOpenPeriod(tx, bill.periodId);

      // Manually overridden shares stay; everyone else splits the rest equally.
      const overrides = new Map(
        bill.shares.filter((s) => s.isOverride).map((s) => [s.memberId, toCentavos(s.amount)]),
      );
      const shares = resplitBill(total, order, overrides);

      await tx.update(billItems).set({ totalAmount: fromCentavos(total) }).where(eq(billItems.id, billId));
      await upsertBillShares(tx, billId, shares, overrides);
    });
  });
}

const addBillSchema = z.object({
  periodId: id,
  name: z.string().trim().min(1, "Enter a bill name").max(60),
  total: money,
  paidById: id,
});

export async function addBill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(addBillSchema, formData, async ({ periodId, name, total, paidById }) => {
    await db.transaction(async (tx) => {
      const { order } = await loadOpenPeriod(tx, periodId);
      if (!order.includes(paidById)) throw new ActionError("The payer isn't a member of this month.");

      const [bill] = await tx
        .insert(billItems)
        .values({ periodId, name, totalAmount: fromCentavos(total), paidById })
        .returning({ id: billItems.id });
      await upsertBillShares(tx, bill.id, splitEqually(total, order), new Map());
    });
  });
}

// ---------- Advances ----------

const addAdvanceSchema = z.object({
  periodId: id,
  payerId: id,
  category: z.enum(["grocery", "food", "service", "misc"], { message: "Choose a category" }),
  description: z.string().trim().min(1, "Enter a description").max(120),
  amount: money,
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
});

export async function addAdvance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(addAdvanceSchema, formData, async ({ periodId, payerId, category, description, amount, spentOn }) => {
    await db.transaction(async (tx) => {
      const { order } = await loadOpenPeriod(tx, periodId);
      if (!order.includes(payerId)) throw new ActionError("The payer isn't a member of this month.");
      // No advance_shares rows = split equally across the month's members.
      await tx.insert(advances).values({
        periodId,
        payerId,
        category,
        description,
        amount: fromCentavos(amount),
        spentOn,
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

async function upsertBillShares(
  tx: Tx,
  billItemId: number,
  shares: Map<number, Centavos>,
  overrides: Map<number, Centavos>,
) {
  for (const [memberId, amount] of shares) {
    const values = { billItemId, memberId, amount: fromCentavos(amount), isOverride: overrides.has(memberId) };
    await tx
      .insert(billItemShares)
      .values(values)
      .onConflictDoUpdate({
        target: [billItemShares.billItemId, billItemShares.memberId],
        set: { amount: values.amount, isOverride: values.isOverride },
      });
  }
}

/** Validates input, runs the change, refreshes the month page, and turns errors into messages. */
async function run<S extends z.ZodType>(
  schema: S,
  input: FormData | Record<string, unknown>,
  fn: (data: z.output<S>) => Promise<void>,
): Promise<ActionState> {
  const parsed = schema.safeParse(input instanceof FormData ? Object.fromEntries(input) : input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await fn(parsed.data);
  } catch (error) {
    if (error instanceof ActionError || error instanceof SettlementError) {
      return { ok: false, error: error.message };
    }
    if (isUniqueViolation(error)) return { ok: false, error: "A bill with that name already exists this month." };
    console.error(error);
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }

  revalidatePath("/periods/[year]/[month]", "page");
  return { ok: true };
}

function isUniqueViolation(error: unknown): boolean {
  // postgres-js errors carry the SQLSTATE code; Drizzle may wrap them in `cause`.
  const code = (e: unknown) => (e as { code?: string } | null)?.code;
  return code(error) === "23505" || code((error as { cause?: unknown } | null)?.cause) === "23505";
}
