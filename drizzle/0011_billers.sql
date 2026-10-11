CREATE TYPE "public"."biller_field_kind" AS ENUM('text', 'link', 'secret', 'heading');--> statement-breakpoint
CREATE TABLE "biller_fields" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "biller_fields_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"biller_id" integer NOT NULL,
	"kind" "biller_field_kind" NOT NULL,
	"label" text NOT NULL,
	"value" text,
	"secret_value" text,
	"housemates_can_see" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "biller_fields_secret_not_plain" CHECK ("biller_fields"."kind" <> 'secret' OR "biller_fields"."value" IS NULL),
	CONSTRAINT "biller_fields_only_secret_encrypted" CHECK ("biller_fields"."kind" = 'secret' OR "biller_fields"."secret_value" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "biller_fields" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "billers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "billers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "biller_fields" ADD CONSTRAINT "biller_fields_biller_id_billers_id_fk" FOREIGN KEY ("biller_id") REFERENCES "public"."billers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "biller_fields_biller_id" ON "biller_fields" USING btree ("biller_id");