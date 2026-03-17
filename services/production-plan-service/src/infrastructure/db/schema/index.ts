import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const schemaNamespace = "production_plan";

export const productionPlanImportBatchStatuses = [
  "completed",
  "completed_with_invalid_rows"
] as const;

export type ProductionPlanImportBatchStatus =
  (typeof productionPlanImportBatchStatuses)[number];

export const productionPlanSchema = pgSchema(schemaNamespace);

export const productionPlanImportBatches = productionPlanSchema.table(
  "import_batches",
  {
    id: uuid("id").primaryKey().notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    sheetName: varchar("sheet_name", { length: 255 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    totalRowCount: integer("total_row_count").notNull(),
    validRowCount: integer("valid_row_count").notNull(),
    invalidRowCount: integer("invalid_row_count").notNull(),
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
  }
);

export const productionPlanRows = productionPlanSchema.table(
  "rows",
  {
    id: uuid("id").primaryKey().notNull(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => productionPlanImportBatches.id, {
        onDelete: "cascade"
      }),
    rowIndex: integer("row_index").notNull(),
    sourceRowJson: jsonb("source_row_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    weekRaw: varchar("week_raw", { length: 100 }),
    weekNumber: integer("week_number"),
    customerName: varchar("customer_name", { length: 255 }),
    orderingPartyCode: varchar("ordering_party_code", { length: 100 }),
    customerOrderNumber: varchar("customer_order_number", { length: 100 }),
    customerOrderItemNumber: varchar("customer_order_item_number", {
      length: 100
    }),
    workOrderNumber: varchar("work_order_number", { length: 100 }),
    materialCode: varchar("material_code", { length: 100 }),
    materialName: varchar("material_name", { length: 255 }),
    quantity: numeric("quantity", {
      precision: 18,
      scale: 3,
      mode: "number"
    }),
    orderUnit: varchar("order_unit", { length: 50 }),
    plannedFinishDate: date("planned_finish_date", { mode: "string" }),
    departmentCode: varchar("department_code", { length: 100 }),
    priority: varchar("priority", { length: 100 }),
    isValid: boolean("is_valid").notNull(),
    validationErrors: jsonb("validation_errors")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
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
    batchIdIndex: index("production_plan_rows_batch_id_idx").on(table.batchId),
    batchRowUniqueIndex: uniqueIndex(
      "production_plan_rows_batch_id_row_index_unique"
    ).on(table.batchId, table.rowIndex)
  })
);

export type ProductionPlanImportBatch =
  typeof productionPlanImportBatches.$inferSelect;
export type ProductionPlanRow = typeof productionPlanRows.$inferSelect;
