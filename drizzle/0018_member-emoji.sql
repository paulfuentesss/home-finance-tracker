DROP TABLE "member_photos" CASCADE;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "emoji" text;--> statement-breakpoint
ALTER TABLE "members" DROP COLUMN "photo_updated_at";--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_emoji_length" CHECK (char_length("members"."emoji") <= 32);