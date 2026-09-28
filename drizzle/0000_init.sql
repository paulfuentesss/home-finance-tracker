CREATE TYPE "public"."advance_category" AS ENUM('grocery', 'food', 'service', 'misc');--> statement-breakpoint
CREATE TYPE "public"."bill_source" AS ENUM('manual', 'email');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('confirmed', 'pending');--> statement-breakpoint
CREATE TYPE "public"."period_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "advance_shares" (
	"advance_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advance_shares_advance_id_member_id_pk" PRIMARY KEY("advance_id","member_id"),
	CONSTRAINT "advance_shares_amount_nonneg" CHECK ("advance_shares"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "advance_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "advances" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "advances_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"period_id" integer NOT NULL,
	"payer_id" integer NOT NULL,
	"category" "advance_category" NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"spent_on" date NOT NULL,
	"receipt_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advances_amount_positive" CHECK ("advances"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "advances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bill_item_shares" (
	"bill_item_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"is_override" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_item_shares_bill_item_id_member_id_pk" PRIMARY KEY("bill_item_id","member_id"),
	CONSTRAINT "bill_item_shares_amount_nonneg" CHECK ("bill_item_shares"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "bill_item_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bill_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bill_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"period_id" integer NOT NULL,
	"name" text NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"paid_by_id" integer NOT NULL,
	"due_date" date,
	"receipt_path" text,
	"source" "bill_source" DEFAULT 'manual' NOT NULL,
	"status" "bill_status" DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_items_total_positive" CHECK ("bill_items"."total_amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "bill_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_periods" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "billing_periods_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" "period_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_periods_month_range" CHECK ("billing_periods"."month" between 1 and 12)
);
--> statement-breakpoint
ALTER TABLE "billing_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "members" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "members_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_collector" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"period_id" integer NOT NULL,
	"from_member_id" integer NOT NULL,
	"to_member_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_on" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_distinct_members" CHECK ("payments"."from_member_id" <> "payments"."to_member_id")
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "period_balances" (
	"period_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"opening_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"closing_balance" numeric(12, 2),
	CONSTRAINT "period_balances_period_id_member_id_pk" PRIMARY KEY("period_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "period_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "advance_shares" ADD CONSTRAINT "advance_shares_advance_id_advances_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."advances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_shares" ADD CONSTRAINT "advance_shares_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_period_id_billing_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_payer_id_members_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_item_shares" ADD CONSTRAINT "bill_item_shares_bill_item_id_bill_items_id_fk" FOREIGN KEY ("bill_item_id") REFERENCES "public"."bill_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_item_shares" ADD CONSTRAINT "bill_item_shares_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_period_id_billing_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_paid_by_id_members_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_period_id_billing_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_from_member_id_members_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_to_member_id_members_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_balances" ADD CONSTRAINT "period_balances_period_id_billing_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_balances" ADD CONSTRAINT "period_balances_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_items_period_name" ON "bill_items" USING btree ("period_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_periods_year_month" ON "billing_periods" USING btree ("year","month");--> statement-breakpoint
CREATE UNIQUE INDEX "members_single_collector" ON "members" USING btree ("is_collector") WHERE "members"."is_collector";