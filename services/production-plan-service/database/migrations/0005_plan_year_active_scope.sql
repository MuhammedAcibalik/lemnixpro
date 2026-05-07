ALTER TABLE production_plan.production_plan_import_batches
ADD COLUMN IF NOT EXISTS plan_year integer;

UPDATE production_plan.production_plan_import_batches AS batch
SET plan_year = derived.plan_year
FROM (
  SELECT
    rows.batch_id,
    min(extract(year from rows.planned_finish_date)::int) AS plan_year,
    count(distinct extract(year from rows.planned_finish_date)::int) AS year_count
  FROM production_plan.production_plan_rows AS rows
  WHERE rows.is_valid = true
    AND rows.planned_finish_date IS NOT NULL
  GROUP BY rows.batch_id
) AS derived
WHERE batch.id = derived.batch_id
  AND derived.year_count = 1
  AND batch.plan_year IS NULL;

DROP INDEX IF EXISTS production_plan.production_plan_import_batches_active_week_unique;

CREATE INDEX IF NOT EXISTS production_plan_import_batches_plan_year_week_idx
ON production_plan.production_plan_import_batches (plan_year, week_number);

CREATE UNIQUE INDEX IF NOT EXISTS production_plan_import_batches_active_year_week_unique
ON production_plan.production_plan_import_batches (plan_year, week_number)
WHERE status = 'active';
