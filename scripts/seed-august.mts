// Loads August 2026 from the household sheet (lib/__fixtures__/august-2026.ts) as test data.
//
//   npm run db:seed:august              # load it if August 2026 doesn't exist yet
//   npm run db:seed:august -- --replace # delete August 2026 and load it fresh (resets test data)
//
// Only ever touches the 2026-08 period. Run `npm run db:seed` first (members).

import { and, eq, inArray } from "drizzle-orm";
import { createDb } from "../db/client";
import {
  advances,
  billEmails,
  billingPeriods,
  billItems,
  billItemShares,
  members,
  payments,
  periodBalances,
  sharedColumnMembers,
  sharedColumns,
} from "../db/schema";
import { AUGUST_2026, DEFAULT_COLUMN, type MemberName } from "../lib/__fixtures__/august-2026";
import { fromCentavos, toCentavos } from "../lib/money";
import { computeBillShares, splitOrder } from "../lib/settlement";

const url = process.env.DIRECT_URL;
if (!url) throw new Error("DIRECT_URL is not set — fill in .env.local first.");
const replace = process.argv.includes("--replace");

const { db, client } = createDb(url, { max: 1 });

try {
  await db.transaction(async (tx) => {
    const existing = await tx.query.billingPeriods.findFirst({
      where: and(eq(billingPeriods.year, AUGUST_2026.year), eq(billingPeriods.month, AUGUST_2026.month)),
    });
    if (existing && !replace) {
      console.log("August 2026 already exists — nothing to do. (Use -- --replace to reset it.)");
      return;
    }
    if (existing) {
      // Child rows first: the foreign keys are ON DELETE RESTRICT to protect history.
      const billIds = (await tx.select({ id: billItems.id }).from(billItems).where(eq(billItems.periodId, existing.id))).map((b) => b.id);
      await tx.delete(advances).where(eq(advances.periodId, existing.id));
      // shared_column_members rows go with their column (ON DELETE CASCADE).
      await tx.delete(sharedColumns).where(eq(sharedColumns.periodId, existing.id));
      if (billIds.length) await tx.delete(billItemShares).where(inArray(billItemShares.billItemId, billIds));
      await tx.delete(billItems).where(eq(billItems.periodId, existing.id));
      await tx.delete(payments).where(eq(payments.periodId, existing.id));
      await tx.delete(periodBalances).where(eq(periodBalances.periodId, existing.id));
      await tx.delete(billingPeriods).where(eq(billingPeriods.id, existing.id));
      // Its bill emails too, so the sample emails can be imported again (npm run bills:import).
      await tx
        .delete(billEmails)
        .where(and(eq(billEmails.billYear, AUGUST_2026.year), eq(billEmails.billMonth, AUGUST_2026.month)));
      console.log("Deleted the existing August 2026.");
    }

    const allMembers = await tx.query.members.findMany({
      where: eq(members.active, true),
      orderBy: (m, { asc }) => [asc(m.sortOrder), asc(m.id)],
    });
    if (allMembers.length === 0) throw new Error("No members — run npm run db:seed first.");
    const idOf = (name: MemberName) => {
      const member = allMembers.find((m) => m.name === name);
      if (!member) throw new Error(`Member "${name}" not found — run npm run db:seed first.`);
      return member.id;
    };
    const byName = (record: Partial<Record<MemberName, number>>) =>
      new Map(Object.entries(record).map(([name, v]) => [idOf(name as MemberName), v]));
    const memberIds = allMembers.map((m) => m.id);
    const order = splitOrder(allMembers);

    const [period] = await tx
      .insert(billingPeriods)
      .values({ year: AUGUST_2026.year, month: AUGUST_2026.month })
      .returning();
    await tx.insert(periodBalances).values(memberIds.map((memberId) => ({ periodId: period.id, memberId })));

    for (const bill of AUGUST_2026.bills) {
      const [row] = await tx
        .insert(billItems)
        .values({
          periodId: period.id,
          name: bill.name,
          totalAmount: bill.totalAmount,
          paidById: idOf(bill.paidBy),
          splitMode: bill.splitMode,
          dueDate: bill.dueDate ?? null,
          paidOn: bill.paidOn ?? null,
        })
        .returning();
      const points = byName(bill.points ?? {});
      const shares = computeBillShares(bill.splitMode, toCentavos(bill.totalAmount), order, { points });
      await tx.insert(billItemShares).values(
        [...shares].map(([memberId, c]) => ({
          billItemId: row.id,
          memberId,
          amount: fromCentavos(c),
          points: bill.splitMode === "points" ? String(points.get(memberId) ?? 0) : null,
        })),
      );
    }

    const columnIds = new Map<string, number>();
    for (const column of AUGUST_2026.columns) {
      const [row] = await tx
        .insert(sharedColumns)
        .values({ periodId: period.id, name: column.name, splitMode: column.splitMode, isDefault: column.isDefault ?? false })
        .returning();
      columnIds.set(column.name, row.id);
      await tx.insert(sharedColumnMembers).values(
        allMembers.map((m) => ({
          columnId: row.id,
          memberId: m.id,
          included: column.included ? column.included.includes(m.name as MemberName) : true,
          amount: column.amounts?.[m.name as MemberName] ?? null,
        })),
      );
    }

    for (const advance of AUGUST_2026.advances) {
      await tx.insert(advances).values({
        periodId: period.id,
        columnId: columnIds.get(advance.column ?? DEFAULT_COLUMN)!,
        payerId: idOf(advance.payer),
        category: advance.category,
        description: advance.description,
        amount: advance.amount,
        spentOn: advance.spentOn,
      });
    }
    console.log(`Loaded August 2026: ${AUGUST_2026.bills.length} bills, ${AUGUST_2026.advances.length} advances.`);
  });
} finally {
  await client.end();
}
