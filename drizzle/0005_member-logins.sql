CREATE TYPE "public"."member_role" AS ENUM('admin', 'member');--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "auth_user_id" uuid;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "role" "member_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_auth_user_id_unique" UNIQUE("auth_user_id");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_email_lowercase" CHECK ("members"."email" = lower("members"."email"));--> statement-breakpoint
-- Hand-added: the collector (PA) becomes the admin; everyone else stays "member".
UPDATE "members" SET "role" = 'admin' WHERE "is_collector";
