-- NULL = the House Budget (docs/settlement-rules.md). Run this only once the code that reads
-- NULL sides is deployed: until then a House Budget payment fails on NOT NULL instead of
-- reaching code that can't read it (docs/decisions.md, 2026-10-12). Every existing row has
-- both sides set, so the new check passes.
ALTER TABLE "payments" ALTER COLUMN "from_member_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "to_member_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_has_member" CHECK ("payments"."from_member_id" IS NOT NULL OR "payments"."to_member_id" IS NOT NULL);
