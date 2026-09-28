CREATE TYPE "public"."bill_email_status" AS ENUM('imported', 'unmatched', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."bill_provider" AS ENUM('meralco', 'water', 'pldt');--> statement-breakpoint
CREATE TABLE "bill_emails" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bill_emails_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"message_id" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"from_address" text NOT NULL,
	"subject" text NOT NULL,
	"snippet" text NOT NULL,
	"provider" "bill_provider",
	"amount" numeric(12, 2),
	"due_date" date,
	"period_start" date,
	"period_end" date,
	"bill_year" integer,
	"bill_month" integer,
	"status" "bill_email_status" NOT NULL,
	"reason" text,
	"bill_item_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_emails_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "bill_emails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bill_emails" ADD CONSTRAINT "bill_emails_bill_item_id_bill_items_id_fk" FOREIGN KEY ("bill_item_id") REFERENCES "public"."bill_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_emails_one_per_month" ON "bill_emails" USING btree ("provider","bill_year","bill_month") WHERE "bill_emails"."status" <> 'dismissed';