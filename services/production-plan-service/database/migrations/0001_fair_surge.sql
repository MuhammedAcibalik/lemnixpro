ALTER TABLE "production_plan"."production_plan_import_batches" ADD COLUMN "week_number" integer;--> statement-breakpoint
ALTER TABLE "production_plan"."production_plan_import_batches" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
WITH "resolved_batch_weeks" AS (
	 SELECT
		"b"."id",
		CASE
			WHEN count(DISTINCT "r"."week_number") FILTER (WHERE "r"."week_number" IS NOT NULL) = 1
				THEN min("r"."week_number") FILTER (WHERE "r"."week_number" IS NOT NULL)
			ELSE NULL
		END AS "resolved_week_number"
	FROM "production_plan"."production_plan_import_batches" AS "b"
	LEFT JOIN "production_plan"."production_plan_rows" AS "r"
		ON "r"."batch_id" = "b"."id"
	GROUP BY "b"."id"
)
UPDATE "production_plan"."production_plan_import_batches" AS "b"
SET
	"week_number" = "resolved_batch_weeks"."resolved_week_number",
	"activated_at" = NULL,
	"status" = 'imported'
FROM "resolved_batch_weeks"
WHERE "b"."id" = "resolved_batch_weeks"."id";--> statement-breakpoint
CREATE INDEX "production_plan_import_batches_week_number_idx" ON "production_plan"."production_plan_import_batches" USING btree ("week_number");--> statement-breakpoint
CREATE UNIQUE INDEX "production_plan_import_batches_active_week_unique" ON "production_plan"."production_plan_import_batches" USING btree ("week_number") WHERE "production_plan"."production_plan_import_batches"."status" = 'active';
