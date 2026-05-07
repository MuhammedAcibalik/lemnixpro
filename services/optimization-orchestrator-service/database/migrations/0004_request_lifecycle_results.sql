ALTER TABLE "optimization"."optimization_requests"
  ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "failed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "result_id" varchar(100),
  ADD COLUMN IF NOT EXISTS "failure_reason" text,
  ADD COLUMN IF NOT EXISTS "failure_reason_code" varchar(80),
  ADD COLUMN IF NOT EXISTS "solver_mode" varchar(40);

