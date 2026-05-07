ALTER TABLE "result"."optimization_results" ADD COLUMN IF NOT EXISTS "payload_json" jsonb;--> statement-breakpoint
ALTER TABLE "result"."optimization_results" ADD COLUMN IF NOT EXISTS "metrics_json" jsonb;
