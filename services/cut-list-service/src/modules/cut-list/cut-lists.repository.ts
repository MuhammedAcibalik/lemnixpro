import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import type {
  CutListSnapshotDetail,
  CutListSnapshotSummary
} from "@lemnixpro/shared-contracts";

import { DATABASE_CLIENT } from "../../infrastructure/db/database.tokens";
import type { CutListDatabase } from "../../infrastructure/db/client";
import {
  cutListSnapshots,
  type CutListSnapshotRecord
} from "../../infrastructure/db/schema";

const POSTGRES_UNIQUE_VIOLATION_CODE = "23505";
const SOURCE_BATCH_UNIQUE_INDEX = "cut_list_snapshots_source_batch_id_unique";

export type CreateCutListSnapshotRecord = {
  planYear: number;
  weekNumber: number;
  sourceBatchId: string;
  payloadJson: CutListSnapshotDetail;
  summary: Omit<CutListSnapshotSummary, "id" | "createdAt">;
};

@Injectable()
export class CutListsRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly databaseClient: CutListDatabase
  ) {}

  async create(
    input: CreateCutListSnapshotRecord
  ): Promise<CutListSnapshotRecord> {
    const existingSnapshot = await this.findBySourceBatchId(input.sourceBatchId);

    if (existingSnapshot) {
      return existingSnapshot;
    }

    try {
      const [createdSnapshot] = await this.databaseClient
        .insert(cutListSnapshots)
        .values({
          id: randomUUID(),
          planYear: input.planYear,
          weekNumber: input.weekNumber,
          sourceBatchId: input.sourceBatchId,
          status: input.summary.status,
          payloadJson: input.payloadJson,
          totalProductionRows: input.summary.totalProductionRows,
          matchedProductionRows: input.summary.matchedProductionRows,
          unmatchedProductionRows: input.summary.unmatchedProductionRows,
          totalCuttingLines: input.summary.totalCuttingLines
        })
        .returning();

      if (!createdSnapshot) {
        throw new Error("Failed to create cut list snapshot.");
      }

      return createdSnapshot;
    } catch (error) {
      if (!isSourceBatchUniqueViolation(error)) {
        throw error;
      }

      const racedSnapshot = await this.findBySourceBatchId(input.sourceBatchId);

      if (!racedSnapshot) {
        throw error;
      }

      return racedSnapshot;
    }
  }

  async updateBySourceBatchId(
    sourceBatchId: string,
    input: {
      planYear: number;
      weekNumber: number;
      payloadJson: CutListSnapshotDetail;
      totalProductionRows: number;
      matchedProductionRows: number;
      unmatchedProductionRows: number;
      totalCuttingLines: number;
    }
  ): Promise<CutListSnapshotRecord | null> {
    const [updated] = await this.databaseClient
      .update(cutListSnapshots)
      .set({
        planYear: input.planYear,
        weekNumber: input.weekNumber,
        payloadJson: input.payloadJson,
        totalProductionRows: input.totalProductionRows,
        matchedProductionRows: input.matchedProductionRows,
        unmatchedProductionRows: input.unmatchedProductionRows,
        totalCuttingLines: input.totalCuttingLines,
        status: "created"
      })
      .where(eq(cutListSnapshots.sourceBatchId, sourceBatchId))
      .returning();

    return updated ?? null;
  }

  async findBySourceBatchId(
    sourceBatchId: string
  ): Promise<CutListSnapshotRecord | null> {
    const [snapshot] = await this.databaseClient
      .select()
      .from(cutListSnapshots)
      .where(eq(cutListSnapshots.sourceBatchId, sourceBatchId))
      .limit(1);

    return snapshot ?? null;
  }

  async findAll(): Promise<CutListSnapshotRecord[]> {
    return this.databaseClient
      .select()
      .from(cutListSnapshots)
      .orderBy(
        desc(cutListSnapshots.planYear),
        desc(cutListSnapshots.weekNumber),
        desc(cutListSnapshots.createdAt)
      );
  }

  async findById(id: string): Promise<CutListSnapshotRecord | null> {
    const [snapshot] = await this.databaseClient
      .select()
      .from(cutListSnapshots)
      .where(eq(cutListSnapshots.id, id))
      .limit(1);

    return snapshot ?? null;
  }

  async findLatestByWeekNumber(
    weekNumber: number
  ): Promise<CutListSnapshotRecord | null> {
    const [snapshot] = await this.databaseClient
      .select()
      .from(cutListSnapshots)
      .where(eq(cutListSnapshots.weekNumber, weekNumber))
      .orderBy(desc(cutListSnapshots.createdAt))
      .limit(1);

    return snapshot ?? null;
  }

  async findLatestByPlanYearAndWeekNumber(
    planYear: number,
    weekNumber: number
  ): Promise<CutListSnapshotRecord | null> {
    const [snapshot] = await this.databaseClient
      .select()
      .from(cutListSnapshots)
      .where(
        and(
          eq(cutListSnapshots.planYear, planYear),
          eq(cutListSnapshots.weekNumber, weekNumber)
        )
      )
      .orderBy(desc(cutListSnapshots.createdAt))
      .limit(1);

    return snapshot ?? null;
  }
}

type PostgresConstraintError = {
  code?: string;
  constraint?: string;
};

function isSourceBatchUniqueViolation(
  error: unknown
): error is PostgresConstraintError {
  if (!error || typeof error !== "object") {
    return false;
  }

  const { code, constraint } = error as PostgresConstraintError;

  return (
    code === POSTGRES_UNIQUE_VIOLATION_CODE &&
    constraint === SOURCE_BATCH_UNIQUE_INDEX
  );
}
