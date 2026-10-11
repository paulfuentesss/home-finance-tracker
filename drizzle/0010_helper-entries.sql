CREATE TYPE "public"."bill_kind" AS ENUM('standard', 'helper');--> statement-breakpoint
CREATE TYPE "public"."helper_entry_kind" AS ENUM('visit', 'early_pay', 'opening');--> statement-breakpoint
CREATE TABLE "helper_entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "helper_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"period_id" integer NOT NULL,
	"kind" "helper_entry_kind" NOT NULL,
	"payer_id" integer,
	"on_date" date,
	"amount" numeric(12, 2) NOT NULL,
	"deduction" numeric(12, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "helper_entries_amount_positive" CHECK ("helper_entries"."amount" > 0),
	CONSTRAINT "helper_entries_deduction_range" CHECK ("helper_entries"."deduction" >= 0 AND "helper_entries"."deduction" <= "helper_entries"."amount"),
	CONSTRAINT "helper_entries_deduction_visit_only" CHECK ("helper_entries"."kind" = 'visit' OR "helper_entries"."deduction" = 0),
	CONSTRAINT "helper_entries_payer" CHECK (("helper_entries"."kind" = 'opening') = ("helper_entries"."payer_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "helper_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bill_items" ADD COLUMN "kind" "bill_kind" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
-- Hand-edited: the existing Helper columns become helper bills (matched by name, any letter case).
-- With no helper_entries yet they keep their typed totals and payer.
UPDATE "bill_items" SET "kind" = 'helper' WHERE lower(trim("name")) = 'helper';--> statement-breakpoint
ALTER TABLE "helper_entries" ADD CONSTRAINT "helper_entries_period_id_billing_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helper_entries" ADD CONSTRAINT "helper_entries_payer_id_members_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "helper_entries_period_id" ON "helper_entries" USING btree ("period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_items_one_helper" ON "bill_items" USING btree ("period_id") WHERE "bill_items"."kind" = 'helper';