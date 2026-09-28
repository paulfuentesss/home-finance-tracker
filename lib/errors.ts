// Errors shared by the Server Actions and the code they call (lib/invites.ts). Kept free of
// "server-only" so the unit tests can load it.

/** A problem to show the household as-is ("That month is closed…"). `run()` turns it into a message. */
export class ActionError extends Error {}

/**
 * Whether a database error is a unique-constraint violation (optionally on one named
 * constraint). postgres-js errors carry the SQLSTATE code; Drizzle may wrap them in `cause`.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = (e: unknown) => e as { code?: string; constraint_name?: string } | null;
  for (const e of [pgError(error), pgError((error as { cause?: unknown } | null)?.cause)]) {
    if (e?.code === "23505" && (!constraint || e.constraint_name === constraint)) return true;
  }
  return false;
}
