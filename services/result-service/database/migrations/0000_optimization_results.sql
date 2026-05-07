CREATE SCHEMA IF NOT EXISTS "result";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "result"."optimization_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"result_id" uuid,
	"status" varchar(40) NOT NULL,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"reason" varchar(2000),
	"event_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "optimization_results_job_id_unique" ON "result"."optimization_results" USING btree ("job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "optimization_results_status_idx" ON "result"."optimization_results" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "optimization_results_created_at_idx" ON "result"."optimization_results" USING btree ("created_at");
