-- Receipts move to their own table (several per bill or payment). The old receipt_path
-- columns were never written by the app; checked empty on 2026-10-08 before dropping them.
CREATE TABLE "receipts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "receipts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"storage_path" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"original_name" text,
	"bill_item_id" integer,
	"payment_id" integer,
	"uploaded_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_storage_path_unique" UNIQUE("storage_path"),
	CONSTRAINT "receipts_one_owner" CHECK (num_nonnulls("receipts"."bill_item_id", "receipts"."payment_id") = 1),
	CONSTRAINT "receipts_size_positive" CHECK ("receipts"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_bill_item_id_bill_items_id_fk" FOREIGN KEY ("bill_item_id") REFERENCES "public"."bill_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_uploaded_by_id_members_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipts_bill_item_id" ON "receipts" USING btree ("bill_item_id");--> statement-breakpoint
CREATE INDEX "receipts_payment_id" ON "receipts" USING btree ("payment_id");--> statement-breakpoint
ALTER TABLE "advances" DROP COLUMN "receipt_path";--> statement-breakpoint
ALTER TABLE "bill_items" DROP COLUMN "receipt_path";