import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import type { MainProfileCuttingSpec } from "@lemnixpro/shared-contracts";

export const schemaNamespace = "master_data";

export const masterDataSchema = pgSchema(schemaNamespace);

export const mainProfiles = masterDataSchema.table(
  "main_profiles",
  {
    id: uuid("id").primaryKey().notNull(),
    facilityId: varchar("facility_id", { length: 128 }).notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    stockLengthMm: integer("stock_length_mm").notNull(),
    linkedProductCode: varchar("linked_product_code", { length: 100 }).notNull(),
    linkedProductName: varchar("linked_product_name", { length: 200 }).notNull(),
    cuttingSpecs: jsonb("cutting_specs")
      .$type<MainProfileCuttingSpec[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", {
      mode: "string",
      withTimezone: true
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      mode: "string",
      withTimezone: true
    })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    linkedProductAndProfileCodeUnique: uniqueIndex(
      "master_data_main_profiles_facility_product_profile_code_unique"
    ).on(table.facilityId, table.linkedProductCode, table.code),
    facilityIndex: index("master_data_main_profiles_facility_idx").on(
      table.facilityId
    ),
    activeLinkedProductIndex: index(
      "master_data_main_profiles_active_linked_product_idx"
    ).on(table.facilityId, table.isActive, table.linkedProductCode),
    stockLengthPositiveCheck: check(
      "master_data_main_profiles_stock_length_positive",
      sql`${table.stockLengthMm} > 0`
    )
  })
);

export const mainProfileImportBatches = masterDataSchema.table(
  "main_profile_import_batches",
  {
    id: uuid("id").primaryKey().notNull(),
    facilityId: varchar("facility_id", { length: 128 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    sheetName: varchar("sheet_name", { length: 255 }).notNull(),
    totalRowCount: integer("total_row_count").notNull(),
    validRowCount: integer("valid_row_count").notNull(),
    invalidRowCount: integer("invalid_row_count").notNull(),
    importedProfileCount: integer("imported_profile_count").notNull(),
    importedCuttingSpecCount: integer("imported_cutting_spec_count").notNull(),
    createdAt: timestamp("created_at", {
      mode: "string",
      withTimezone: true
    })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    facilityIndex: index("master_data_profile_import_batches_facility_idx").on(
      table.facilityId
    )
  })
);

export type MainProfile = typeof mainProfiles.$inferSelect;
export type MainProfileImportBatch = typeof mainProfileImportBatches.$inferSelect;
