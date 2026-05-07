CREATE TABLE IF NOT EXISTS "optimization"."cut_list_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"week_number" integer NOT NULL,
	"source_batch_id" varchar(100) NOT NULL,
	"status" varchar(40) NOT NULL,
	"payload_json" jsonb NOT NULL,
	"total_production_rows" integer NOT NULL,
	"matched_production_rows" integer NOT NULL,
	"unmatched_production_rows" integer NOT NULL,
	"total_cutting_lines" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cut_list_snapshots_week_number_idx" ON "optimization"."cut_list_snapshots" USING btree ("week_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cut_list_snapshots_created_at_idx" ON "optimization"."cut_list_snapshots" USING btree ("created_at");
