ALTER TYPE "optimization"."optimization_request_status" ADD VALUE IF NOT EXISTS 'running' AFTER 'queued';--> statement-breakpoint
ALTER TYPE "optimization"."optimization_request_status" ADD VALUE IF NOT EXISTS 'completed' AFTER 'running';--> statement-breakpoint
ALTER TYPE "optimization"."optimization_request_status" ADD VALUE IF NOT EXISTS 'failed' AFTER 'completed';--> statement-breakpoint
ALTER TYPE "optimization"."optimization_request_status" ADD VALUE IF NOT EXISTS 'failed_with_quality_floor' AFTER 'failed_preparation';--> statement-breakpoint
ALTER TABLE "optimization"."optimization_requests" ADD COLUMN IF NOT EXISTS "cut_list_snapshot_id" varchar(100);--> statement-breakpoint
ALTER TABLE "optimization"."optimization_requests" ADD COLUMN IF NOT EXISTS "plan_year" integer;--> statement-breakpoint
ALTER TABLE "optimization"."optimization_requests" ADD COLUMN IF NOT EXISTS "config_json" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "optimization_requests_cut_list_snapshot_id_idx" ON "optimization"."optimization_requests" USING btree ("cut_list_snapshot_id");
