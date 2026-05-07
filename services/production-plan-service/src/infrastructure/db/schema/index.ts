import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const schemaNamespace = "production_plan";

export const productionPlanImportBatchStatuses = [
  "imported",
  "active",
  "superseded"
] as const;

export type ProductionPlanImportBatchStatus =
  (typeof productionPlanImportBatchStatuses)[number];

export const productionPlanSchema = pgSchema(schemaNamespace);

export const productionPlanImportBatches = productionPlanSchema.table(
  "production_plan_import_batches",
  {
    id: uuid("id").primaryKey().notNull(),
    facilityId: varchar("facility_id", { length: 128 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    sheetName: varchar("sheet_name", { length: 255 }).notNull(),
    planYear: integer("plan_year"),
    weekNumber: integer("week_number"),
    status: varchar("status", { length: 40 }).notNull(),
    totalRowCount: integer("total_row_count").notNull(),
    validRowCount: integer("valid_row_count").notNull(),
    invalidRowCount: integer("invalid_row_count").notNull(),
    activatedAt: timestamp("activated_at", {
      mode: "string",
      withTimezone: true
    }),
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
    weekNumberIndex: index("production_plan_import_batches_week_number_idx").on(
      table.facilityId,
      table.weekNumber
    ),
    planYearWeekIndex: index("production_plan_import_batches_plan_year_week_idx").on(
      table.facilityId,
      table.planYear,
      table.weekNumber
    ),
    facilityStatusIndex: index(
      "production_plan_import_batches_facility_status_idx"
    ).on(table.facilityId, table.status),
    activeWeekUniqueIndex: uniqueIndex(
      "production_plan_import_batches_facility_active_year_week_unique"
    )
      .on(table.facilityId, table.planYear, table.weekNumber)
      .where(sql`${table.status} = 'active'`)
  })
);

export const productionPlanRows = productionPlanSchema.table(
  "production_plan_rows",
  {
    id: uuid("id").primaryKey().notNull(),
    facilityId: varchar("facility_id", { length: 128 }).notNull(),
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
    materialName: text("material_name"),
    materialColor: varchar("material_color", { length: 40 }),
    materialSize: varchar("material_size", { length: 20 }),
    mainProfileCode: varchar("main_profile_code", { length: 100 }),
    quantity: numeric("quantity", {
      precision: 18,
      scale: 3,
      mode: "number"
    }),
    orderUnit: varchar("order_unit", { length: 50 }),
    plannedFinishDate: date("planned_finish_date", { mode: "string" }),
    departmentCode: varchar("department_code", { length: 100 }),
    departmentName: varchar("department_name", { length: 100 }),
    priority: varchar("priority", { length: 100 }),
    priorityLevel: integer("priority_level"),
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
    facilityBatchIndex: index("production_plan_rows_facility_batch_idx").on(
      table.facilityId,
      table.batchId
    ),
    batchMaterialCodeIndex: index(
      "production_plan_rows_batch_material_code_idx"
    ).on(table.facilityId, table.batchId, table.materialCode),
    batchWorkOrderIndex: index("production_plan_rows_batch_work_order_idx").on(
      table.facilityId,
      table.batchId,
      table.workOrderNumber
    ),
    batchRowUniqueIndex: uniqueIndex(
      "production_plan_rows_batch_id_row_index_unique"
    ).on(table.batchId, table.rowIndex)
  })
);

export const productionPlanOutboxEvents = productionPlanSchema.table(
  "production_plan_outbox_events",
  {
    id: uuid("id").primaryKey().notNull(),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payloadJson: jsonb("payload_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    status: varchar("status", { length: 40 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", {
      mode: "string",
      withTimezone: true
    })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", {
      mode: "string",
      withTimezone: true
    })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", {
      mode: "string",
      withTimezone: true
    })
  },
  (table) => ({
    statusNextAttemptIndex: index(
      "production_plan_outbox_events_status_next_attempt_idx"
    ).on(table.status, table.nextAttemptAt),
    aggregateIndex: index("production_plan_outbox_events_aggregate_idx").on(
      table.aggregateId
    )
  })
);

export type ProductionPlanImportBatch =
  typeof productionPlanImportBatches.$inferSelect;
export type ProductionPlanRow = typeof productionPlanRows.$inferSelect;
export type ProductionPlanOutboxEvent =
  typeof productionPlanOutboxEvents.$inferSelect;
