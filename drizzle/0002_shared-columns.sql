-- Hand-edited: advances now require a shared column. Only August 2026 test data exists, and
-- it is re-seeded right after this migration (npm run db:seed:august -- --replace).
DELETE FROM "advance_shares";--> statement-breakpoint
DELETE FROM "advances";--> statement-breakpoint
CREATE TABLE "shared_column_members" (
	"column_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"included" boolean DEFAULT true NOT NULL,
	"amount" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_column_members_column_id_member_id_pk" PRIMARY KEY("column_id","member_id"),
	CONSTRAINT "shared_column_members_amount_nonneg" CHECK ("shared_column_members"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "shared_column_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shared_columns" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shared_columns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"period_id" integer NOT NULL,
	"name" text NOT NULL,
	"split_mode" "bill_split_mode" DEFAULT 'equal' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_columns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "advance_shares" CASCADE;--> statement-breakpoint
ALTER TABLE "advances" ADD COLUMN "column_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "shared_column_members" ADD CONSTRAINT "shared_column_members_column_id_shared_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."shared_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_column_members" ADD CONSTRAINT "shared_column_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_columns" ADD CONSTRAINT "shared_columns_period_id_billing_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shared_columns_period_name" ON "shared_columns" USING btree ("period_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_columns_one_default" ON "shared_columns" USING btree ("period_id") WHERE "shared_columns"."is_default";--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_column_id_shared_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."shared_columns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" DROP COLUMN "shared_with";