CREATE SCHEMA IF NOT EXISTS "production_plan";
--> statement-breakpoint
CREATE TABLE "production_plan"."production_plan_import_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"sheet_name" varchar(255) NOT NULL,
	"status" varchar(40) NOT NULL,
	"total_row_count" integer NOT NULL,
	"valid_row_count" integer NOT NULL,
	"invalid_row_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_plan"."production_plan_rows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"source_row_json" jsonb NOT NULL,
	"week_raw" varchar(100),
	"week_number" integer,
	"customer_name" varchar(255),
	"ordering_party_code" varchar(100),
	"customer_order_number" varchar(100),
	"customer_order_item_number" varchar(100),
	"work_order_number" varchar(100),
	"material_code" varchar(100),
	"material_name" varchar(255),
	"quantity" numeric(18, 3),
	"order_unit" varchar(50),
	"planned_finish_date" date,
	"department_code" varchar(100),
	"priority" varchar(100),
	"is_valid" boolean NOT NULL,
	"validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_plan"."production_plan_rows" ADD CONSTRAINT "production_plan_rows_batch_id_production_plan_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "production_plan"."production_plan_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_plan_rows_batch_id_idx" ON "production_plan"."production_plan_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_plan_rows_batch_id_row_index_unique" ON "production_plan"."production_plan_rows" USING btree ("batch_id","row_index");
