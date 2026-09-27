// Opt-in: loads the August 2026 prototype data as a real billing period.
// Only use this if August 2026 should be the first month in the app.
// Run: npm run db:seed (first), then npm run db:seed:august

import { and, eq } from "drizzle-orm";
import { createDb } from "../db/client";
import {
  advanceShares,
  advances,
  billingPeriods,
  billItems,
  billItemShares,
  members,
  periodBalances,
} from "../db/schema";
import { AUGUST_2026, type MemberName } from "../lib/__fixtures__/august-2026";
import { fromCentavos, splitByWeights, splitEqually, toCentavos } from "../lib/money";

const url = process.env.DIRECT_URL;
if (!url) throw new Error("DIRECT_URL is not set — fill in .env.local first.");

const { db, client } = createDb(url, { max: 1 });

try {
  const existing = await db.query.billingPeriods.findFirst({
    where: and(eq(billingPeriods.year, AUGUST_2026.year), eq(billingPeriods.month, AUGUST_2026.month)),
  });
  if (existing) {
    console.log("August 2026 already exists — nothing to do.");
  } else {
    await db.transaction(async (tx) => {
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
      const memberIds = allMembers.map((m) => m.id);

      const [period] = await tx
        .insert(billingPeriods)
        .values({ year: AUGUST_2026.year, month: AUGUST_2026.month })
        .returning();

      // Period membership, starting from a zero balance (the prototype's prevUnsettled).
      await tx.insert(periodBalances).values(memberIds.map((memberId) => ({ periodId: period.id, memberId })));

      for (const bill of AUGUST_2026.bills) {
        const [row] = await tx
          .insert(billItems)
          .values({ periodId: period.id, name: bill.name, totalAmount: bill.totalAmount, paidById: idOf(bill.paidBy) })
          .returning();
        const shares = splitEqually(toCentavos(bill.totalAmount), memberIds);
        await tx
          .insert(billItemShares)
          .values([...shares].map(([memberId, c]) => ({ billItemId: row.id, memberId, amount: fromCentavos(c) })));
      }

      for (const advance of AUGUST_2026.advances) {
        const [row] = await tx
          .insert(advances)
          .values({
            periodId: period.id,
            payerId: idOf(advance.payer),
            category: advance.category,
            description: advance.description,
            amount: advance.amount,
            spentOn: advance.spentOn,
          })
          .returning();
        if ("customWeights" in advance) {
          const weights = Object.entries(advance.customWeights).map(
            ([name, w]) => [idOf(name as MemberName), w] as const,
          );
          const shares = splitByWeights(toCentavos(advance.amount), weights);
          await tx
            .insert(advanceShares)
            .values([...shares].map(([memberId, c]) => ({ advanceId: row.id, memberId, amount: fromCentavos(c) })));
        }
      }
    });
    console.log(
      `Loaded August 2026: ${AUGUST_2026.bills.length} bills, ${AUGUST_2026.advances.length} advances.`,
    );
  }
} finally {
  await client.end();
}
