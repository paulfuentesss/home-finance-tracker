-- Hand-edited: a one-time backfill after the generated ADD COLUMN, so bills sent before "seen"
-- existed don't all show "not seen yet". Someone whose latest visit (member_devices) came after
-- the send has opened My House since; the date kept is that latest visit, not the first one
-- (docs/decisions.md). Rows sent later are filled in by /api/seen.
ALTER TABLE "reminder_sends" ADD COLUMN "seen_at" timestamp with time zone;--> statement-breakpoint
UPDATE "reminder_sends" AS r
SET "seen_at" = d."last_seen_at"
FROM (
  SELECT "member_id", max("last_seen_at") AS "last_seen_at" FROM "member_devices" GROUP BY "member_id"
) AS d
WHERE r."member_id" = d."member_id"
  AND r."kind" IN ('payables', 'bills_in')
  AND d."last_seen_at" > r."sent_at";
