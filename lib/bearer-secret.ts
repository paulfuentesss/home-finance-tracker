// The shared-secret check for the two routes without a login: /api/bill-email (the household
// Gmail's script) and /api/reminders (Vercel's daily job). Pure, so it's unit-tested.

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * `Authorization: Bearer <secret>`, compared in constant time. Both sides are hashed first so
 * the comparison takes the same time whatever the lengths. An empty secret matches nothing.
 */
export function checkBearerSecret(authorization: string | null, secret: string): boolean {
  if (!secret) return false;
  const given = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!given) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(given), hash(secret));
}
