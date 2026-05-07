ALTER TYPE "optimization"."optimization_request_status" ADD VALUE IF NOT EXISTS 'queued' BEFORE 'failed_preparation';--> statement-breakpoint
ALTER TABLE "optimization"."optimization_requests" ADD COLUMN IF NOT EXISTS "queued_at" timestamp with time zone;
