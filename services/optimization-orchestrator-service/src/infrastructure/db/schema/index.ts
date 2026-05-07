import {
  optimizationRequestStatusesV2,
  type OptimizationConfig,
  type OptimizationRequestPayload,
  type OptimizationRequestPayloadV2
} from "@lemnixpro/shared-contracts";
import {
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
import { sql } from "drizzle-orm";

export const schemaNamespace = "optimization";

export const optimizationSchema = pgSchema(schemaNamespace);

/**
 * Status lifecycle (V1 + V2 share the same enum so existing rows continue to work):
 *   created → ready → queued → running → completed | failed
 *   created → failed_preparation
 *   completed (with quality floor violation) → failed_with_quality_floor
 */
export const optimizationRequestStatusEnum = optimizationSchema.enum(
  "optimization_request_status",
  optimizationRequestStatusesV2
);

export const optimizationRequests = optimizationSchema.table(
  "optimization_requests",
  {
    id: uuid("id").primaryKey().notNull(),
    weekNumber: integer("week_number").notNull(),
    /** Production-plan batch id (V1) — kept for backward compatibility. */
    sourceBatchId: varchar("source_batch_id", { length: 100 }).notNull(),
    /** Cut-list snapshot id (V2). Nullable so V1 rows remain valid. */
    cutListSnapshotId: varchar("cut_list_snapshot_id", { length: 100 }),
    /** ISO plan year for V2 snapshot-driven requests. */
    planYear: integer("plan_year"),
    status: optimizationRequestStatusEnum("status").notNull(),
    /** Either the V1 payload shape or the V2 payload shape. UI selects based on cutListSnapshotId. */
    payloadJson: jsonb("payload_json")
      .$type<OptimizationRequestPayload | OptimizationRequestPayloadV2>()
      .notNull(),
    /** Frozen optimizer configuration; null only on legacy V1 rows. */
    configJson: jsonb("config_json").$type<OptimizationConfig>(),
    /** Deterministic key for duplicate active-request suppression. */
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    matchedRows: integer("matched_rows").notNull(),
    unmatchedRows: integer("unmatched_rows").notNull(),
    queuedAt: timestamp("queued_at", {
      mode: "string",
      withTimezone: true
    }),
    startedAt: timestamp("started_at", {
      mode: "string",
      withTimezone: true
    }),
    completedAt: timestamp("completed_at", {
      mode: "string",
      withTimezone: true
    }),
    failedAt: timestamp("failed_at", {
      mode: "string",
      withTimezone: true
    }),
    resultId: varchar("result_id", { length: 100 }),
    failureReason: text("failure_reason"),
    failureReasonCode: varchar("failure_reason_code", { length: 80 }),
    solverMode: varchar("solver_mode", { length: 40 }),
    progressJson: jsonb("progress_json").$type<{
      currentProfileCode?: string | null;
      completedGroups: number;
      totalGroups: number;
      elapsedMs: number;
      remainingBudgetMs: number;
      heartbeatAt: string;
    } | null>(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", {
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
    cutListSnapshotIdIndex: index(
      "optimization_requests_cut_list_snapshot_id_idx"
    ).on(table.cutListSnapshotId),
    statusCreatedAtIndex: index(
      "optimization_requests_status_created_at_idx"
    ).on(table.status, table.createdAt),
    activeIdempotencyKeyUniqueIndex: uniqueIndex(
      "optimization_requests_active_idempotency_key_uq"
    )
      .on(table.idempotencyKey)
      .where(
        sql`${table.idempotencyKey} is not null and ${table.status} in ('created', 'ready', 'queued', 'running')`
      ),
    statusUpdatedAtIndex: index(
      "optimization_requests_status_updated_at_idx"
    ).on(table.status, table.updatedAt),
    createdAtIndex: index("optimization_requests_created_at_idx").on(
      table.createdAt
    )
  })
);

export type OptimizationRequestRecord = typeof optimizationRequests.$inferSelect;

/** Row shape for list/overview endpoints — excludes large JSON blobs. */
export type OptimizationRequestListRecord = Omit<
  OptimizationRequestRecord,
  "payloadJson" | "configJson"
>;
