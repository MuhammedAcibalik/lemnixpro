CREATE INDEX IF NOT EXISTS "production_plan_rows_batch_material_code_idx"
  ON "production_plan"."production_plan_rows" ("batch_id", "material_code");

CREATE INDEX IF NOT EXISTS "production_plan_rows_batch_work_order_idx"
  ON "production_plan"."production_plan_rows" ("batch_id", "work_order_number");
