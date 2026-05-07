DROP INDEX IF EXISTS "master_data"."master_data_main_profiles_code_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "master_data_main_profiles_linked_product_profile_code_unique" ON "master_data"."main_profiles" USING btree ("linked_product_code","code");
