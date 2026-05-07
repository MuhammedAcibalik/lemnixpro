ALTER TABLE cut_list.cut_list_snapshots
ADD COLUMN IF NOT EXISTS plan_year integer;

UPDATE cut_list.cut_list_snapshots
SET plan_year = extract(year from created_at)::int
WHERE plan_year IS NULL;

ALTER TABLE cut_list.cut_list_snapshots
ALTER COLUMN plan_year SET NOT NULL;

CREATE INDEX IF NOT EXISTS cut_list_snapshots_plan_year_week_idx
ON cut_list.cut_list_snapshots (plan_year, week_number);

CREATE UNIQUE INDEX IF NOT EXISTS cut_list_snapshots_source_batch_id_unique
ON cut_list.cut_list_snapshots (source_batch_id);
