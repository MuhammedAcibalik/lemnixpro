import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";

import type {
  OptimizationCompletedMessage,
  OptimizationFailedMessage,
  OptimizationResultMetrics,
  OptimizationResultPayload
} from "@lemnixpro/shared-contracts";

import { DATABASE_CLIENT } from "../../infrastructure/db/database.tokens";
import type { ResultDatabase } from "../../infrastructure/db/client";
import {
  optimizationResults,
  type OptimizationResultRecord
} from "../../infrastructure/db/schema";

@Injectable()
export class ResultsRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly databaseClient: ResultDatabase
  ) {}

  async recordCompleted(
    message: OptimizationCompletedMessage & {
      payload?: OptimizationResultPayload;
    }
  ): Promise<OptimizationResultRecord> {
    const inlinePayload = message.payload ?? null;
    const inlineMetrics = inlinePayload?.metrics ?? null;
    const [record] = await this.databaseClient
      .insert(optimizationResults)
      .values({
        id: randomUUID(),
        jobId: message.jobId,
        resultId: message.resultId,
        status: "completed",
        completedAt: message.completedAt,
        failedAt: null,
        reason: null,
        eventJson: message,
        payloadJson:
          (inlinePayload as unknown as Record<string, unknown> | null) ?? null,
        metricsJson:
          (inlineMetrics as unknown as Record<string, unknown> | null) ?? null
      })
      .onConflictDoUpdate({
        target: optimizationResults.jobId,
        set: {
          resultId: message.resultId,
          status: "completed",
          completedAt: message.completedAt,
          failedAt: null,
          reason: null,
          eventJson: message,
          ...(inlinePayload
            ? {
                payloadJson: inlinePayload,
                metricsJson: inlineMetrics
              }
            : {}),
          updatedAt: new Date().toISOString()
        }
      })
      .returning();

    if (!record) {
      throw new Error("Failed to persist optimization completed event.");
    }

    return record;
  }

  async recordFailed(
    message: OptimizationFailedMessage
  ): Promise<OptimizationResultRecord> {
    const [record] = await this.databaseClient
      .insert(optimizationResults)
      .values({
        id: randomUUID(),
        jobId: message.jobId,
        resultId: null,
        status: "failed",
        completedAt: null,
        failedAt: message.failedAt,
        reason: message.reason,
        eventJson: message
      })
      .onConflictDoUpdate({
        target: optimizationResults.jobId,
        set: {
          resultId: null,
          status: "failed",
          completedAt: null,
          failedAt: message.failedAt,
          reason: message.reason,
          eventJson: message,
          updatedAt: new Date().toISOString()
        }
      })
      .returning();

    if (!record) {
      throw new Error("Failed to persist optimization failed event.");
    }

    return record;
  }

  async findAll(): Promise<OptimizationResultRecord[]> {
    return this.databaseClient
      .select()
      .from(optimizationResults)
      .orderBy(desc(optimizationResults.createdAt));
  }

  async findById(id: string): Promise<OptimizationResultRecord | null> {
    const [record] = await this.databaseClient
      .select()
      .from(optimizationResults)
      .where(eq(optimizationResults.id, id))
      .limit(1);

    return record ?? null;
  }

  async findByJobId(jobId: string): Promise<OptimizationResultRecord | null> {
    const [record] = await this.databaseClient
      .select()
      .from(optimizationResults)
      .where(eq(optimizationResults.jobId, jobId))
      .limit(1);

    return record ?? null;
  }

  /**
   * Engine-driven write path: persist the full optimization payload alongside its
   * metrics so the UI can fetch a fully populated result without an extra hop.
   */
  async upsertPayload(input: {
    jobId: string;
    resultId: string;
    completedAt: string;
    payload: OptimizationResultPayload;
    metrics: OptimizationResultMetrics;
  }): Promise<OptimizationResultRecord> {
    const eventEcho = {
      jobId: input.jobId,
      resultId: input.resultId,
      completedAt: input.completedAt,
      source: "engine.payload"
    } as Record<string, unknown>;

    const [record] = await this.databaseClient
      .insert(optimizationResults)
      .values({
        id: randomUUID(),
        jobId: input.jobId,
        resultId: input.resultId,
        status: "completed",
        completedAt: input.completedAt,
        failedAt: null,
        reason: null,
        eventJson: eventEcho,
        payloadJson: input.payload,
        metricsJson: input.metrics
      })
      .onConflictDoUpdate({
        target: optimizationResults.jobId,
        set: {
          resultId: input.resultId,
          status: "completed",
          completedAt: input.completedAt,
          failedAt: null,
          reason: null,
          payloadJson: input.payload,
          metricsJson: input.metrics,
          updatedAt: new Date().toISOString()
        }
      })
      .returning();

    if (!record) {
      throw new Error("Failed to persist optimization payload.");
    }

    return record;
  }
}
