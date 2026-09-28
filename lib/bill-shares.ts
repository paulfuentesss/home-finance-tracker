// Writing a bill's materialized shares. Shared by the Server Actions and the email import
// (lib/bill-import.ts), which also runs from scripts/ — so this imports the schema directly,
// not "@/db" (server-only).

import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { billItemShares } from "@/db/schema";
import { fromCentavos, type Centavos } from "@/lib/money";
import type { MemberId } from "@/lib/settlement";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function pointsOf(shares: { memberId: number; points: string | null }[]): Map<MemberId, number> {
  return new Map(shares.map((s) => [s.memberId, s.points === null ? 0 : Number(s.points)]));
}

/** A points bill's points for this month's members; if nobody has any, everyone gets 1. */
export function pointsFor(shares: { memberId: number; points: string | null }[], order: readonly MemberId[]) {
  const points = pointsOf(shares);
  if (order.every((m) => (points.get(m) ?? 0) === 0)) order.forEach((m) => points.set(m, 1));
  return points;
}

/** Replaces a bill's shares (and points, in points mode). */
export async function writeShares(
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
