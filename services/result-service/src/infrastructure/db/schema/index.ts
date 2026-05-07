import {
  index,
  jsonb,
  pgSchema,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const schemaNamespace = "result";

export const resultSchema = pgSchema(schemaNamespace);

export const optimizationResults = resultSchema.table(
  "optimization_results",
  {
    id: uuid("id").primaryKey().notNull(),
    jobId: uuid("job_id").notNull(),
    resultId: uuid("result_id"),
    status: varchar("status", { length: 40 }).notNull(),
    completedAt: timestamp("completed_at", {
      mode: "string",
      withTimezone: true
    }),
    failedAt: timestamp("failed_at", {
      mode: "string",
      withTimezone: true
    }),
    reason: varchar("reason", { length: 2000 }),
    eventJson: jsonb("event_json").$type<Record<string, unknown>>().notNull(),
    /** Rich V2 result payload (patterns, breakdowns, leftovers...). Null when only an event has been received. */
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>(),
    /** Pre-extracted metrics for fast list views without parsing the full payload. */
    metricsJson: jsonb("metrics_json").$type<Record<string, unknown>>(),
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
    jobIdUniqueIndex: uniqueIndex("optimization_results_job_id_unique").on(
      table.jobId
    ),
    statusIndex: index("optimization_results_status_idx").on(table.status),
    createdAtIndex: index("optimization_results_created_at_idx").on(
      table.createdAt
    )
  })
);

export type OptimizationResultRecord = typeof optimizationResults.$inferSelect;
