CREATE TYPE "public"."bill_split_mode" AS ENUM('equal', 'points', 'manual');--> statement-breakpoint
ALTER TABLE "bill_items" DROP CONSTRAINT "bill_items_total_positive";--> statement-breakpoint
ALTER TABLE "advances" ALTER COLUMN "spent_on" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "advances" ADD COLUMN "shared_with" integer[];--> statement-breakpoint
ALTER TABLE "bill_item_shares" ADD COLUMN "points" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "bill_items" ADD COLUMN "split_mode" "bill_split_mode" DEFAULT 'equal' NOT NULL;--> statement-breakpoint
ALTER TABLE "bill_items" ADD COLUMN "paid_on" date;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_total_nonneg" CHECK ("bill_items"."total_amount" >= 0);