ALTER TABLE "production_plan"."production_plan_import_batches"
ADD COLUMN IF NOT EXISTS "facility_id" varchar(128);
--> statement-breakpoint
UPDATE "production_plan"."production_plan_import_batches"
SET "facility_id" = 'default-facility'
WHERE "facility_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "production_plan"."production_plan_import_batches"
ALTER COLUMN "facility_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_plan"."production_plan_rows"
ADD COLUMN IF NOT EXISTS "facility_id" varchar(128);
--> statement-breakpoint
UPDATE "production_plan"."production_plan_rows" AS row
SET "facility_id" = batch."facility_id"
FROM "production_plan"."production_plan_import_batches" AS batch
WHERE row."batch_id" = batch."id"
  AND row."facility_id" IS NULL;
--> statement-breakpoint
UPDATE "production_plan"."production_plan_rows"
SET "facility_id" = 'default-facility'
WHERE "facility_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "production_plan"."production_plan_rows"
ALTER COLUMN "facility_id" SET NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "production_plan"."production_plan_import_batches_week_number_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "production_plan"."production_plan_import_batches_plan_year_week_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "production_plan"."production_plan_import_batches_active_year_week_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "production_plan"."production_plan_rows_batch_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "production_plan"."production_plan_rows_batch_material_code_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "production_plan"."production_plan_rows_batch_work_order_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_plan_import_batches_week_number_idx"
ON "production_plan"."production_plan_import_batches" USING btree ("facility_id", "week_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_plan_import_batches_plan_year_week_idx"
ON "production_plan"."production_plan_import_batches" USING btree ("facility_id", "plan_year", "week_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_plan_import_batches_facility_status_idx"
ON "production_plan"."production_plan_import_batches" USING btree ("facility_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "production_plan_import_batches_facility_active_year_week_unique"
ON "production_plan"."production_plan_import_batches" USING btree ("facility_id", "plan_year", "week_number")
WHERE "status" = 'active';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_plan_rows_batch_id_idx"
ON "production_plan"."production_plan_rows" USING btree ("batch_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_plan_rows_facility_batch_idx"
ON "production_plan"."production_plan_rows" USING btree ("facility_id", "batch_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_plan_rows_batch_material_code_idx"
ON "production_plan"."production_plan_rows" USING btree ("facility_id", "batch_id", "material_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_plan_rows_batch_work_order_idx"
ON "production_plan"."production_plan_rows" USING btree ("facility_id", "batch_id", "work_order_number");
