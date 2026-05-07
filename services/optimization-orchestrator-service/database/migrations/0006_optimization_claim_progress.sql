ALTER TYPE "optimization"."optimization_request_status" ADD VALUE IF NOT EXISTS 'cancelled' AFTER 'failed';

ALTER TABLE "optimization"."optimization_requests"
  ADD COLUMN IF NOT EXISTS "progress_json" jsonb,
  ADD COLUMN IF NOT EXISTS "last_heartbeat_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "optimization_requests_status_updated_at_idx"
  ON "optimization"."optimization_requests" ("status", "updated_at" DESC);

