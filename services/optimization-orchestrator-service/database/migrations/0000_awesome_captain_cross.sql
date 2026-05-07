CREATE SCHEMA IF NOT EXISTS "optimization";
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "optimization"."optimization_request_status" AS ENUM('created', 'ready', 'failed_preparation');
EXCEPTION
 WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "optimization"."optimization_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"week_number" integer NOT NULL,
	"source_batch_id" varchar(100) NOT NULL,
	"status" "optimization"."optimization_request_status" NOT NULL,
	"payload_json" jsonb NOT NULL,
	"matched_rows" integer NOT NULL,
	"unmatched_rows" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "optimization_requests_week_number_idx" ON "optimization"."optimization_requests" USING btree ("week_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "optimization_requests_source_batch_id_idx" ON "optimization"."optimization_requests" USING btree ("source_batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "optimization_requests_created_at_idx" ON "optimization"."optimization_requests" USING btree ("created_at");
