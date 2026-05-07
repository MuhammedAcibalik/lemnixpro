ALTER TABLE "master_data"."main_profiles" ADD COLUMN "cutting_specs" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE TABLE "master_data"."main_profile_import_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"sheet_name" varchar(255) NOT NULL,
	"total_row_count" integer NOT NULL,
	"valid_row_count" integer NOT NULL,
	"invalid_row_count" integer NOT NULL,
	"imported_profile_count" integer NOT NULL,
	"imported_cutting_spec_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
