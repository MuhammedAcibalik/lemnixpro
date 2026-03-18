import { optimizationRequestStatuses, type OptimizationRequestPayload } from "@lemnixpro/shared-contracts";
import {
  index,
  integer,
  jsonb,
  pgSchema,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const schemaNamespace = "optimization";

export const optimizationSchema = pgSchema(schemaNamespace);

export const optimizationRequestStatusEnum = optimizationSchema.enum(
  "optimization_request_status",
  optimizationRequestStatuses
);

export const optimizationRequests = optimizationSchema.table(
  "optimization_requests",
  {
    id: uuid("id").primaryKey().notNull(),
    weekNumber: integer("week_number").notNull(),
    sourceBatchId: varchar("source_batch_id", { length: 100 }).notNull(),
    status: optimizationRequestStatusEnum("status").notNull(),
    payloadJson: jsonb("payload_json")
      .$type<OptimizationRequestPayload>()
      .notNull(),
    matchedRows: integer("matched_rows").notNull(),
    unmatchedRows: integer("unmatched_rows").notNull(),
    queuedAt: timestamp("queued_at", {
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
    weekNumberIndex: index("optimization_requests_week_number_idx").on(
      table.weekNumber
    ),
    sourceBatchIdIndex: index("optimization_requests_source_batch_id_idx").on(
      table.sourceBatchId
    ),
    createdAtIndex: index("optimization_requests_created_at_idx").on(
      table.createdAt
    )
  })
);

export type OptimizationRequestRecord = typeof optimizationRequests.$inferSelect;
