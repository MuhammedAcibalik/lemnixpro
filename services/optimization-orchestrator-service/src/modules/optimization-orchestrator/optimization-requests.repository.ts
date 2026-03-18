import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";

import type {
  OptimizationRequestPayload,
  OptimizationRequestStatus
} from "@lemnixpro/shared-contracts";

import { DATABASE_CLIENT } from "../../infrastructure/db/database.tokens";
import type { OptimizationOrchestratorDatabase } from "../../infrastructure/db/client";
import {
  optimizationRequests,
  type OptimizationRequestRecord
} from "../../infrastructure/db/schema";

export type CreateOptimizationRequestRecord = {
  weekNumber: number;
  sourceBatchId: string;
  payloadJson: OptimizationRequestPayload;
  matchedRows: number;
  unmatchedRows: number;
};

export type UpdateOptimizationRequestStatusRecord = {
  id: string;
  status: OptimizationRequestStatus;
  queuedAt?: string;
};

export type MarkOptimizationRequestQueuedRecord = {
  id: string;
  queuedAt: string;
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
        status: "created",
        payloadJson: input.payloadJson,
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

  async findAll(): Promise<OptimizationRequestRecord[]> {
    return this.databaseClient
      .select()
      .from(optimizationRequests)
      .orderBy(
        desc(optimizationRequests.createdAt),
        desc(optimizationRequests.id)
      );
  }

  async findReady(): Promise<OptimizationRequestRecord[]> {
    return this.databaseClient
      .select()
      .from(optimizationRequests)
      .where(eq(optimizationRequests.status, "ready"))
      .orderBy(
        desc(optimizationRequests.createdAt),
        desc(optimizationRequests.id)
      );
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
}
