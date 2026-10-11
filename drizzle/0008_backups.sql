CREATE TABLE "backups" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "backups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"taken_by_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_taken_by_id_members_id_fk" FOREIGN KEY ("taken_by_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;