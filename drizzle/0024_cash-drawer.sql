CREATE TYPE "public"."cash_drawer_kind" AS ENUM('cash_in', 'spent', 'lent', 'paid_back');--> statement-breakpoint
CREATE TABLE "cash_drawer_entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cash_drawer_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "cash_drawer_kind" NOT NULL,
	"on_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"person" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_drawer_entries_amount_positive" CHECK ("cash_drawer_entries"."amount" > 0),
	CONSTRAINT "cash_drawer_entries_person" CHECK (("cash_drawer_entries"."kind" IN ('lent', 'paid_back')) = ("cash_drawer_entries"."person" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "cash_drawer_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "advances" ADD COLUMN "from_drawer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "helper_entries" ADD COLUMN "from_drawer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_drawer_dated" CHECK (NOT "advances"."from_drawer" OR "advances"."spent_on" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "helper_entries" ADD CONSTRAINT "helper_entries_opening_not_drawer" CHECK ("helper_entries"."kind" <> 'opening' OR NOT "helper_entries"."from_drawer");--> statement-breakpoint
ALTER TABLE "helper_entries" ADD CONSTRAINT "helper_entries_drawer_dated" CHECK (NOT "helper_entries"."from_drawer" OR "helper_entries"."on_date" IS NOT NULL);