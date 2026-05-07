CREATE SCHEMA IF NOT EXISTS "facility";
--> statement-breakpoint
CREATE TYPE "facility"."facility_status" AS ENUM('active', 'inactive');
--> statement-breakpoint
CREATE TABLE "facility"."facilities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" "facility"."facility_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facility_facilities_code_not_blank" CHECK (length(trim("code")) > 0),
	CONSTRAINT "facility_facilities_code_uppercase" CHECK ("code" = upper("code")),
	CONSTRAINT "facility_facilities_name_not_blank" CHECK (length(trim("name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "facility_facilities_code_unique" ON "facility"."facilities" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "facility_facilities_status_idx" ON "facility"."facilities" USING btree ("status");
