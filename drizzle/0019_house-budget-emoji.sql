CREATE TABLE "household_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"house_budget_emoji" text,
	CONSTRAINT "household_settings_single_row" CHECK ("household_settings"."id" = 1),
	CONSTRAINT "household_settings_house_budget_emoji_length" CHECK (char_length("household_settings"."house_budget_emoji") <= 32)
);
--> statement-breakpoint
ALTER TABLE "household_settings" ENABLE ROW LEVEL SECURITY;