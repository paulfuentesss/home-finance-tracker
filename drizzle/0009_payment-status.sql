CREATE TYPE "public"."payment_status" AS ENUM('confirmed', 'pending', 'rejected');--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "status" "payment_status" DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "rejected_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_rejected_reason" CHECK (("payments"."status" = 'rejected') = ("payments"."rejected_reason" IS NOT NULL));