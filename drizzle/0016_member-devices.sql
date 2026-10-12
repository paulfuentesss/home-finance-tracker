-- When each member last used My House, from the installed app or a browser (docs/features/manage.md
-- → Who's using it). Additive only — two new types and a table — so it's safe for the code already
-- deployed.
CREATE TYPE "public"."device_platform" AS ENUM('iphone', 'ipad', 'android', 'mac', 'windows', 'other');--> statement-breakpoint
CREATE TYPE "public"."device_via" AS ENUM('app', 'web');--> statement-breakpoint
CREATE TABLE "member_devices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "member_devices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"member_id" integer NOT NULL,
	"via" "device_via" NOT NULL,
	"platform" "device_platform" NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member_devices" ADD CONSTRAINT "member_devices_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_devices_member_via_platform" ON "member_devices" USING btree ("member_id","via","platform");