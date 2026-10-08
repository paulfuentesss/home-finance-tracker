CREATE TABLE "keep_alive" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"pinged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keep_alive_single_row" CHECK ("keep_alive"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "keep_alive" ENABLE ROW LEVEL SECURITY;