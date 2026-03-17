import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const schemaNamespace = "master_data";

export const masterDataSchema = pgSchema(schemaNamespace);

export const mainProfiles = masterDataSchema.table(
  "main_profiles",
  {
    id: uuid("id").primaryKey().notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    stockLengthMm: integer("stock_length_mm").notNull(),
    linkedProductCode: varchar("linked_product_code", { length: 100 }).notNull(),
    linkedProductName: varchar("linked_product_name", { length: 200 }).notNull(),
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
    codeUniqueIndex: uniqueIndex("master_data_main_profiles_code_unique").on(
      table.code
    ),
    stockLengthPositiveCheck: check(
      "master_data_main_profiles_stock_length_positive",
      sql`${table.stockLengthMm} > 0`
    )
  })
);

export type MainProfile = typeof mainProfiles.$inferSelect;
