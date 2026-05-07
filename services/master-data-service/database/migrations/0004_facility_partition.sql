ALTER TABLE "master_data"."main_profiles"
ADD COLUMN IF NOT EXISTS "facility_id" varchar(128);
--> statement-breakpoint
UPDATE "master_data"."main_profiles"
SET "facility_id" = 'default-facility'
WHERE "facility_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "master_data"."main_profiles"
ALTER COLUMN "facility_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "master_data"."main_profile_import_batches"
ADD COLUMN IF NOT EXISTS "facility_id" varchar(128);
--> statement-breakpoint
UPDATE "master_data"."main_profile_import_batches"
SET "facility_id" = 'default-facility'
WHERE "facility_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "master_data"."main_profile_import_batches"
ALTER COLUMN "facility_id" SET NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "master_data"."master_data_main_profiles_linked_product_profile_code_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "master_data"."master_data_main_profiles_active_linked_product_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "master_data_main_profiles_facility_product_profile_code_unique"
ON "master_data"."main_profiles" USING btree ("facility_id", "linked_product_code", "code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "master_data_main_profiles_facility_idx"
ON "master_data"."main_profiles" USING btree ("facility_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "master_data_main_profiles_active_linked_product_idx"
ON "master_data"."main_profiles" USING btree ("facility_id", "is_active", "linked_product_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "master_data_profile_import_batches_facility_idx"
ON "master_data"."main_profile_import_batches" USING btree ("facility_id");
