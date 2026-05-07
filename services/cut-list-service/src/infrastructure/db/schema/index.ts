import type { CutListSnapshotDetail } from "@lemnixpro/shared-contracts";
import {
  index,
  integer,
  jsonb,
  pgSchema,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const schemaNamespace = "cut_list";

export const cutListSchema = pgSchema(schemaNamespace);

export const cutListSnapshots = cutListSchema.table(
  "cut_list_snapshots",
  {
    id: uuid("id").primaryKey().notNull(),
    planYear: integer("plan_year").notNull(),
    weekNumber: integer("week_number").notNull(),
    sourceBatchId: varchar("source_batch_id", { length: 100 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    payloadJson: jsonb("payload_json").$type<CutListSnapshotDetail>().notNull(),
    totalProductionRows: integer("total_production_rows").notNull(),
    matchedProductionRows: integer("matched_production_rows").notNull(),
    unmatchedProductionRows: integer("unmatched_production_rows").notNull(),
    totalCuttingLines: integer("total_cutting_lines").notNull(),
    createdAt: timestamp("created_at", {
      mode: "string",
      withTimezone: true
    })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    weekNumberIndex: index("cut_list_snapshots_week_number_idx").on(
      table.weekNumber
    ),
    planYearWeekIndex: index("cut_list_snapshots_plan_year_week_idx").on(
      table.planYear,
      table.weekNumber
    ),
    sourceBatchUniqueIndex: uniqueIndex(
      "cut_list_snapshots_source_batch_id_unique"
    ).on(table.sourceBatchId),
    createdAtIndex: index("cut_list_snapshots_created_at_idx").on(
      table.createdAt
    )
  })
);

export type CutListSnapshotRecord = typeof cutListSnapshots.$inferSelect;
