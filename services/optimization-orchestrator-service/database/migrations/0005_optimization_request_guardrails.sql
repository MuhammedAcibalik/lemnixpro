ALTER TABLE "optimization"."optimization_requests"
  ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(128);

CREATE INDEX IF NOT EXISTS "optimization_requests_status_created_at_idx"
  ON "optimization"."optimization_requests" ("status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "optimization_requests_cut_snapshot_status_idx"
  ON "optimization"."optimization_requests" ("cut_list_snapshot_id", "status", "created_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "optimization_requests_active_idempotency_key_uq"
  ON "optimization"."optimization_requests" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL
    AND "status" IN ('created', 'ready', 'queued', 'running');

ALTER TABLE "optimization"."optimization_requests"
  ADD CONSTRAINT "optimization_requests_matched_rows_non_negative"
  CHECK ("matched_rows" >= 0);

ALTER TABLE "optimization"."optimization_requests"
  ADD CONSTRAINT "optimization_requests_unmatched_rows_non_negative"
  CHECK ("unmatched_rows" >= 0);

ALTER TABLE "optimization"."optimization_requests"
  ADD CONSTRAINT "optimization_requests_plan_year_valid"
  CHECK ("plan_year" IS NULL OR ("plan_year" BETWEEN 2000 AND 2100));

ALTER TABLE "optimization"."optimization_requests"
  ADD CONSTRAINT "optimization_requests_week_number_valid"
  CHECK ("week_number" BETWEEN 1 AND 53);
