CREATE INDEX IF NOT EXISTS "master_data_main_profiles_active_linked_product_idx"
  ON "master_data"."main_profiles" ("is_active", "linked_product_code");
