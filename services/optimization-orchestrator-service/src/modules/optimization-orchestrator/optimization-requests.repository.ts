import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type {
  OptimizationConfig,
  OptimizationRequestPayload,
  OptimizationRequestPayloadV2,
  OptimizationRequestStatusV2
} from "@lemnixpro/shared-contracts";

import { DATABASE_CLIENT } from "../../infrastructure/db/database.tokens";
import type { OptimizationOrchestratorDatabase } from "../../infrastructure/db/client";
import {
  optimizationRequests,
  type OptimizationRequestListRecord,
  type OptimizationRequestRecord
} from "../../infrastructure/db/schema";

/**
 * Columns for GET list routes and workspace aggregation. Loading `payload_json` /
 * `config_json` for every row was O(N) on megabyte-scale JSON and pushed the
 * api-gateway workspace overview past upstream + web timeouts (504).
 */
const optimizationRequestListColumns = {
  id: optimizationRequests.id,
  weekNumber: optimizationRequests.weekNumber,
  sourceBatchId: optimizationRequests.sourceBatchId,
  cutListSnapshotId: optimizationRequests.cutListSnapshotId,
  planYear: optimizationRequests.planYear,
  status: optimizationRequests.status,
  idempotencyKey: optimizationRequests.idempotencyKey,
  matchedRows: optimizationRequests.matchedRows,
  unmatchedRows: optimizationRequests.unmatchedRows,
  queuedAt: optimizationRequests.queuedAt,
  startedAt: optimizationRequests.startedAt,
  completedAt: optimizationRequests.completedAt,
  failedAt: optimizationRequests.failedAt,
  resultId: optimizationRequests.resultId,
  failureReason: optimizationRequests.failureReason,
  failureReasonCode: optimizationRequests.failureReasonCode,
  solverMode: optimizationRequests.solverMode,
  progressJson: optimizationRequests.progressJson,
  lastHeartbeatAt: optimizationRequests.lastHeartbeatAt,
  createdAt: optimizationRequests.createdAt,
  updatedAt: optimizationRequests.updatedAt
} as const;

export type CreateOptimizationRequestRecord = {
  weekNumber: number;
  sourceBatchId: string;
  payloadJson: OptimizationRequestPayload;
  matchedRows: number;
  unmatchedRows: number;
};

export type CreateOptimizationRequestV2Record = {
  cutListSnapshotId: string;
  planYear: number;
  weekNumber: number;
  /** Same identifier as the cut-list snapshot to keep V1 column non-null. */
  sourceBatchId: string;
  payloadJson: OptimizationRequestPayloadV2;
  configJson: OptimizationConfig;
  idempotencyKey: string;
  matchedRows: number;
  unmatchedRows: number;
};

export type UpdateOptimizationRequestStatusRecord = {
  id: string;
  status: OptimizationRequestStatusV2;
  queuedAt?: string;
};

export type MarkOptimizationRequestQueuedRecord = {
  id: string;
  queuedAt: string;
};

/** Legacy compatibility only. V2 requests must become `running` from the engine started event. */
export type MarkOptimizationRequestStartedRecord = {
  id: string;
  startedAt: string;
};

export type ClaimOptimizationRequestRecord = {
  id: string;
  startedAt: string;
};

export type MarkOptimizationRequestCompletedRecord = {
  id: string;
  resultId: string | null;
  completedAt: string;
  solverMode?: string | null;
};

export type MarkOptimizationRequestFailedRecord = {
  id: string;
  failedAt: string;
  failureReason: string;
  failureReasonCode?: string | null;
};

export type MarkOptimizationRequestCancelledRecord = {
  id: string;
  failureReason: string;
  failureReasonCode: string;
};

export type RecordOptimizationProgressRecord = {
  id: string;
  progress: {
    currentProfileCode?: string | null;
    completedGroups: number;
    totalGroups: number;
    elapsedMs: number;
    remainingBudgetMs: number;
    heartbeatAt: string;
  };
};

@Injectable()
export class OptimizationRequestsRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly databaseClient: OptimizationOrchestratorDatabase
  ) {}

  async create(
    input: CreateOptimizationRequestRecord
  ): Promise<OptimizationRequestRecord> {
    const [createdRequest] = await this.databaseClient
      .insert(optimizationRequests)
      .values({
        id: randomUUID(),
        weekNumber: input.weekNumber,
        sourceBatchId: input.sourceBatchId,
        cutListSnapshotId: null,
        planYear: null,
        status: "created",
        payloadJson: input.payloadJson,
        configJson: null,
        matchedRows: input.matchedRows,
        unmatchedRows: input.unmatchedRows,
        queuedAt: null
      })
      .returning();

    if (!createdRequest) {
      throw new Error("Failed to create optimization request.");
    }

    return createdRequest;
  }

  async createV2(
    input: CreateOptimizationRequestV2Record
  ): Promise<OptimizationRequestRecord> {
    const [createdRequest] = await this.databaseClient
      .insert(optimizationRequests)
      .values({
        id: randomUUID(),
        weekNumber: input.weekNumber,
        sourceBatchId: input.sourceBatchId,
        cutListSnapshotId: input.cutListSnapshotId,
        planYear: input.planYear,
        status: "created",
        payloadJson: input.payloadJson,
        configJson: input.configJson,
        idempotencyKey: input.idempotencyKey,
        matchedRows: input.matchedRows,
        unmatchedRows: input.unmatchedRows,
        queuedAt: null
      })
      .returning();

    if (!createdRequest) {
      throw new Error("Failed to create optimization request (V2).");
    }

    return createdRequest;
  }

  async findByCutListSnapshotId(
    cutListSnapshotId: string
  ): Promise<OptimizationRequestListRecord[]> {
    return this.databaseClient
      .select(optimizationRequestListColumns)
      .from(optimizationRequests)
      .where(eq(optimizationRequests.cutListSnapshotId, cutListSnapshotId))
      .orderBy(
        desc(optimizationRequests.createdAt),
        desc(optimizationRequests.id)
      );
  }

  async findActiveRecordsByCutListSnapshotId(
    cutListSnapshotId: string
  ): Promise<OptimizationRequestRecord[]> {
    return this.databaseClient
      .select()
      .from(optimizationRequests)
      .where(
        and(
          eq(optimizationRequests.cutListSnapshotId, cutListSnapshotId),
          inArray(optimizationRequests.status, [
            "created",
            "ready",
            "queued",
            "running"
          ])
        )
      )
      .orderBy(
        desc(optimizationRequests.createdAt),
        desc(optimizationRequests.id)
      );
  }

  async findActiveByIdempotencyKey(
    idempotencyKey: string
  ): Promise<OptimizationRequestListRecord | null> {
    const [request] = await this.databaseClient
      .select(optimizationRequestListColumns)
      .from(optimizationRequests)
      .where(
        and(
          eq(optimizationRequests.idempotencyKey, idempotencyKey),
          inArray(optimizationRequests.status, [
            "created",
            "ready",
            "queued",
            "running"
          ])
        )
      )
      .orderBy(
        desc(optimizationRequests.createdAt),
        desc(optimizationRequests.id)
      )
      .limit(1);

    return request ?? null;
  }

  async updateStatus(
    input: UpdateOptimizationRequestStatusRecord
  ): Promise<OptimizationRequestRecord> {
    const statusUpdate = {
      status: input.status,
      updatedAt: sql`now()`,
      ...(input.status === "queued"
        ? {
            queuedAt: input.queuedAt ?? null
          }
        : {})
    };
    const [updatedRequest] = await this.databaseClient
      .update(optimizationRequests)
      .set(statusUpdate)
      .where(eq(optimizationRequests.id, input.id))
      .returning();

    if (!updatedRequest) {
      throw new Error(
        `Failed to update optimization request "${input.id}" to status "${input.status}".`
      );
    }

    return updatedRequest;
  }

  async findAll(): Promise<OptimizationRequestListRecord[]> {
    return this.databaseClient
      .select(optimizationRequestListColumns)
      .from(optimizationRequests)
      .orderBy(
        desc(optimizationRequests.createdAt),
        desc(optimizationRequests.id)
      );
  }

  async findReady(): Promise<OptimizationRequestListRecord[]> {
    return this.databaseClient
      .select(optimizationRequestListColumns)
      .from(optimizationRequests)
      .where(eq(optimizationRequests.status, "ready"))
      .orderBy(
        desc(optimizationRequests.createdAt),
        desc(optimizationRequests.id)
      );
  }

  async findOldestRunning(): Promise<OptimizationRequestListRecord | null> {
    const [request] = await this.databaseClient
      .select(optimizationRequestListColumns)
      .from(optimizationRequests)
      .where(eq(optimizationRequests.status, "running"))
      .orderBy(
        asc(optimizationRequests.startedAt),
        asc(optimizationRequests.createdAt),
        asc(optimizationRequests.id)
      )
      .limit(1);

    return request ?? null;
  }

  async findById(id: string): Promise<OptimizationRequestRecord | null> {
    const [request] = await this.databaseClient
      .select()
      .from(optimizationRequests)
      .where(eq(optimizationRequests.id, id))
      .limit(1);

    return request ?? null;
  }

  async markQueuedFromReady(
    input: MarkOptimizationRequestQueuedRecord
  ): Promise<OptimizationRequestRecord> {
    const [updatedRequest] = await this.databaseClient
      .update(optimizationRequests)
      .set({
        status: "queued",
        queuedAt: input.queuedAt,
        updatedAt: sql`now()`
      })
      .where(
        and(
          eq(optimizationRequests.id, input.id),
          eq(optimizationRequests.status, "ready")
        )
      )
      .returning();

    if (!updatedRequest) {
      throw new Error(
        `Failed to mark optimization request "${input.id}" as queued from ready state.`
      );
    }

    return updatedRequest;
  }

  async markStartedFromEvent(
    input: MarkOptimizationRequestStartedRecord
  ): Promise<OptimizationRequestRecord> {
    const [updatedRequest] = await this.databaseClient
      .update(optimizationRequests)
      .set({
        status: "running",
        startedAt: input.startedAt,
        updatedAt: sql`now()`
      })
      .where(
        and(
          eq(optimizationRequests.id, input.id),
          or(
            eq(optimizationRequests.status, "queued"),
            and(
              eq(optimizationRequests.status, "running"),
              eq(optimizationRequests.startedAt, optimizationRequests.queuedAt),
              isNull(optimizationRequests.resultId)
            )
          )
        )
      )
      .returning();

    if (updatedRequest) {
      return updatedRequest;
    }

    const existing = await this.findById(input.id);
    if (existing) {
      return existing;
    }

    throw new Error(
      `Failed to mark optimization request "${input.id}" as running.`
    );
  }

  async claimQueuedRequest(
    input: ClaimOptimizationRequestRecord
  ): Promise<OptimizationRequestRecord | null> {
    const [updatedRequest] = await this.databaseClient
      .update(optimizationRequests)
      .set({
        status: "running",
        startedAt: input.startedAt,
        updatedAt: sql`now()`
      })
      .where(
        and(
          eq(optimizationRequests.id, input.id),
          or(
            eq(optimizationRequests.status, "queued"),
            and(
              eq(optimizationRequests.status, "running"),
              eq(optimizationRequests.startedAt, optimizationRequests.queuedAt),
              isNull(optimizationRequests.resultId)
            )
          )
        )
      )
      .returning();

    return updatedRequest ?? null;
  }

  async markCompletedFromResult(
    input: MarkOptimizationRequestCompletedRecord
  ): Promise<OptimizationRequestRecord> {
    const [updatedRequest] = await this.databaseClient
      .update(optimizationRequests)
      .set({
        status: "completed",
        completedAt: input.completedAt,
        failedAt: null,
        resultId: input.resultId,
        failureReason: null,
        failureReasonCode: null,
        solverMode: input.solverMode ?? null,
        updatedAt: sql`now()`
      })
      .where(eq(optimizationRequests.id, input.id))
      .returning();

    if (!updatedRequest) {
      throw new Error(
        `Failed to mark optimization request "${input.id}" as completed.`
      );
    }

    return updatedRequest;
  }

  async markFailedFromResult(
    input: MarkOptimizationRequestFailedRecord
  ): Promise<OptimizationRequestRecord> {
    const [updatedRequest] = await this.databaseClient
      .update(optimizationRequests)
      .set({
        status: "failed",
        completedAt: null,
        failedAt: input.failedAt,
        resultId: null,
        failureReason: input.failureReason,
        failureReasonCode: input.failureReasonCode ?? null,
        updatedAt: sql`now()`
      })
      .where(eq(optimizationRequests.id, input.id))
      .returning();

    if (!updatedRequest) {
      throw new Error(
        `Failed to mark optimization request "${input.id}" as failed.`
      );
    }

    return updatedRequest;
  }

  async markCancelled(
    input: MarkOptimizationRequestCancelledRecord
  ): Promise<OptimizationRequestRecord> {
    const [updatedRequest] = await this.databaseClient
      .update(optimizationRequests)
      .set({
        status: "cancelled",
        completedAt: null,
        resultId: null,
        failureReason: input.failureReason,
        failureReasonCode: input.failureReasonCode,
        updatedAt: sql`now()`
      })
      .where(eq(optimizationRequests.id, input.id))
      .returning();

    if (!updatedRequest) {
      throw new Error(
        `Failed to mark optimization request "${input.id}" as cancelled.`
      );
    }

    return updatedRequest;
  }

  async recordProgress(
    input: RecordOptimizationProgressRecord
  ): Promise<OptimizationRequestRecord | null> {
    const [updatedRequest] = await this.databaseClient
      .update(optimizationRequests)
      .set({
        progressJson: input.progress,
        lastHeartbeatAt: input.progress.heartbeatAt,
        updatedAt: sql`now()`
      })
      .where(eq(optimizationRequests.id, input.id))
      .returning();

    return updatedRequest ?? null;
  }
}
