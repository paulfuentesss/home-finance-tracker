// Turns a bill email into a pending bill (docs/settlement-rules.md → "Email-imported bills").
// Called by the inbound-email webhook (with `db` from "@/db") and by `npm run bills:import`
// (with `createDb()`), so it takes the database as a parameter and never imports "@/db".
//
// Every email gets a `bill_emails` row — the Bill inbox. A readable one then fills its month's
// ₱0 bill column as *pending* (not counted until confirmed); anything that doesn't fit stays
// in the inbox as `unmatched` with the reason.

import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { billEmails, billingPeriods, billItems, type BillEmailRow } from "@/db/schema";
import { parseBillEmail, type BillEmail } from "@/lib/bill-email/parse";
import { pointsFor, writeShares, type Tx } from "@/lib/bill-shares";
import { monthLabel } from "@/lib/format";
import { BILL_EMAIL_COLUMNS } from "@/lib/household-config";
import { formatPHP, fromCentavos, toCentavos } from "@/lib/money";
import { computeBillShares, SettlementError, splitOrder } from "@/lib/settlement";

export type ImportOutcome =
  /** Already had this email, or this provider's bill for that month. */
  | { kind: "duplicate" }
  | { kind: "imported"; emailId: number; billItemId: number }
  | { kind: "unmatched"; emailId: number; reason: string };

/** A reason an email can't fill its bill column, in words for the household. */
class NoFit extends Error {}

export async function importBillEmail(db: Database, email: BillEmail): Promise<ImportOutcome> {
  const parsed = parseBillEmail(email);
  const bill = parsed.ok ? parsed.bill : null;
  return db.transaction(async (tx) => {
    // Any unique conflict — the same Message-ID, or a live email for the same provider and
    // month (a reminder or re-forward) — means there's nothing new to do.
    const [row] = await tx
      .insert(billEmails)
      .values({
        messageId: email.messageId,
        receivedAt: new Date(email.receivedAt),
        fromAddress: email.from,
        subject: email.subject,
        // Only unreadable emails keep a snippet (e.g. Gmail's forwarding-confirmation code);
        // a parsed bill's details are in the columns, and bodies hold account numbers.
        snippet: bill ? "" : email.text.replace(/\s+/g, " ").trim().slice(0, 500),
        provider: bill?.provider ?? (parsed.ok ? null : parsed.provider),
        amount: bill ? fromCentavos(bill.amount) : null,
        dueDate: bill?.dueDate ?? null,
        periodStart: bill?.periodStart ?? null,
        periodEnd: bill?.periodEnd ?? null,
        billYear: bill?.year ?? null,
        billMonth: bill?.month ?? null,
        status: "unmatched",
        reason: parsed.ok ? null : parsed.reason,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) return { kind: "duplicate" };
    if (!parsed.ok) return { kind: "unmatched", emailId: row.id, reason: parsed.reason };
    return placeBill(tx, row);
  });
}

/**
 * Fills the email's bill column in its month as a pending bill, or records why it can't
 * (the month isn't started or is closed, no such column, or the column already has an
 * amount). Also used by the inbox's Retry.
 */
export async function placeBill(tx: Tx, row: BillEmailRow): Promise<ImportOutcome> {
  try {
    // A savepoint: if filling the column fails halfway, only that is undone and the inbox
    // row is still updated below.
    const billItemId = await tx.transaction((sp) => fillColumn(sp, row));
    await tx
      .update(billEmails)
      .set({ status: "imported", reason: null, billItemId })
      .where(eq(billEmails.id, row.id));
    return { kind: "imported", emailId: row.id, billItemId };
  } catch (error) {
    if (!(error instanceof NoFit || error instanceof SettlementError)) throw error;
    await tx
      .update(billEmails)
      .set({ status: "unmatched", reason: error.message, billItemId: null })
      .where(eq(billEmails.id, row.id));
    return { kind: "unmatched", emailId: row.id, reason: error.message };
  }
}

async function fillColumn(tx: Tx, row: BillEmailRow): Promise<number> {
  const { provider, amount, billYear, billMonth } = row;
  if (!provider || amount === null || !billYear || !billMonth) {
    throw new NoFit(row.reason ?? "This email couldn't be read as a bill.");
  }
  const label = monthLabel(billYear, billMonth);
  const period = await tx.query.billingPeriods.findFirst({
    where: and(eq(billingPeriods.year, billYear), eq(billingPeriods.month, billMonth)),
    with: { balances: { with: { member: true } } },
  });
  if (!period) throw new NoFit(`${label} hasn't been started yet. Start it, then Retry.`);
  if (period.status !== "open") throw new NoFit(`${label} is closed. Reopen it to add this bill, then Retry.`);

  const name = BILL_EMAIL_COLUMNS[provider];
  const bill = await tx.query.billItems.findFirst({
    where: and(eq(billItems.periodId, period.id), eq(billItems.name, name)),
    with: { shares: true },
  });
  if (!bill) throw new NoFit(`${label} has no "${name}" column. Add it, then Retry.`);
  if (bill.splitMode === "manual") {
    throw new NoFit(`${name} is split manually in ${label}, so type each person's share by hand.`);
  }
  // Never overwrite an amount: it was typed by hand, or another email already filled it.
  const current = toCentavos(bill.totalAmount);
  if (current !== 0) {
    throw new NoFit(`${name} in ${label} already has ${formatPHP(current)}. Change it by hand if this one is right.`);
  }

  const order = splitOrder(period.balances.map((b) => b.member));
  const points = bill.splitMode === "points" ? pointsFor(bill.shares, order) : null;
  const shares = computeBillShares(bill.splitMode, toCentavos(amount), order, { points: points ?? undefined });
  await tx
    .update(billItems)
    .set({ totalAmount: amount, dueDate: row.dueDate ?? bill.dueDate, source: "email", status: "pending" })
    .where(eq(billItems.id, bill.id));
  await writeShares(tx, bill.id, shares, points);
  return bill.id;
}
