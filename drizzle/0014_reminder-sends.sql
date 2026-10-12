-- Emails My House sent (docs/features/reminders.md). Additive only — a new type and table — so
-- it's safe for the code already deployed.
CREATE TYPE "public"."reminder_kind" AS ENUM('week', 'three_days', 'last_day', 'start_next', 'payables');--> statement-breakpoint
CREATE TABLE "reminder_sends" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reminder_sends_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"period_id" integer NOT NULL,
	"kind" "reminder_kind" NOT NULL,
	"member_id" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminder_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_period_id_billing_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_sends_period_kind_member" ON "reminder_sends" USING btree ("period_id","kind","member_id");--> statement-breakpoint
CREATE INDEX "reminder_sends_member_id" ON "reminder_sends" USING btree ("member_id");