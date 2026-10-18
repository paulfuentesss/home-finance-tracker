// Writes the made-up August 2026 (./august-2026.ts) into a database: its members (if missing),
// the month, its bills with their shares, its columns and its advances. Used by
// `npm run db:seed:august` (a local database only) and by the database tests (PGlite).

import { eq } from "drizzle-orm";
import {
  advances,
  billingPeriods,
  billItems,
  billItemShares,
  members,
  periodBalances,
  sharedColumnMembers,
  sharedColumns,
} from "@/db/schema";
import type { Tx } from "@/lib/bill-shares";
import { sharesCosts } from "@/lib/members";
import { fromCentavos, toCentavos } from "@/lib/money";
import { computeBillShares, splitOrder } from "@/lib/settlement";
import { AUGUST_2026, DEFAULT_COLUMN, HOUSEHOLD_MEMBERS, type MemberName } from "./august-2026";

export interface LoadedAugust {
  periodId: number;
  /** The member's id in this database. */
  idOf: (name: MemberName) => number;
}

/** Loads August 2026 (it must not exist yet). */
export async function loadAugust(tx: Tx): Promise<LoadedAugust> {
  // The fixture's members, if this database doesn't have them yet (PA may already be there).
  await tx
    .insert(members)
    .values(HOUSEHOLD_MEMBERS.map((m) => ({ ...m, role: m.isCollector ? ("admin" as const) : ("member" as const) })))
    .onConflictDoNothing();

  // Everyone who shares the costs: a view-only login is in no month (docs/settlement-rules.md).
  const allMembers = (
    await tx.query.members.findMany({
      where: eq(members.active, true),
      orderBy: (m, { asc }) => [asc(m.sortOrder), asc(m.id)],
    })
  ).filter(sharesCosts);
  const idOf = (name: MemberName) => {
    const member = allMembers.find((m) => m.name === name);
    if (!member) {
      throw new Error(
        `Member "${name}" isn't an active housemate (removed, or view only) — re-add them in Manage, or reset the local database.`,
      );
    }
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
        // Marked like migration 0010 marked the live ones: no visits logged, so its typed total counts.
        kind: bill.name.toLowerCase() === "helper" ? "helper" : "standard",
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
  return { periodId: period.id, idOf };
}
