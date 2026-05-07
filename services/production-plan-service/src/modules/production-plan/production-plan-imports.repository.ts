import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";

import { DATABASE_CLIENT } from "../../infrastructure/db/database.tokens";
import type { ProductionPlanDatabase } from "../../infrastructure/db/client";
import {
  productionPlanImportBatches,
  productionPlanOutboxEvents,
  productionPlanRows,
  type ProductionPlanImportBatch,
  type ProductionPlanImportBatchStatus,
  type ProductionPlanOutboxEvent,
  type ProductionPlanRow
} from "../../infrastructure/db/schema";
import type {
  ProductionPlanBatchActivatedEvent,
  ProductionPlanBatchCutListReconcileEvent
} from "@lemnixpro/shared-contracts";
import { routingKeys } from "@lemnixpro/shared-contracts";

const INSERT_CHUNK_SIZE = 500;
const POSTGRES_UNIQUE_VIOLATION_CODE = "23505";
const ACTIVE_BATCH_PER_WEEK_UNIQUE_INDEX =
  "production_plan_import_batches_active_year_week_unique";

export type ProductionPlanImportBatchNotActivatableReason =
  | "no_valid_rows"
  | "missing_week"
  | "conflicting_weeks"
  | "missing_year"
  | "conflicting_years";

function activationNotActivatableDetail(
  reason: ProductionPlanImportBatchNotActivatableReason
): string {
  switch (reason) {
    case "no_valid_rows":
      return "at least one valid row is required";
    case "missing_week":
      return "a resolved week number is required";
    case "conflicting_weeks":
      return "valid rows reference conflicting week numbers";
    case "missing_year":
      return "a resolved plan year is required";
    case "conflicting_years":
      return "valid rows reference conflicting planned finish years";
  }
}

export class ProductionPlanImportBatchNotActivatableError extends Error {
  readonly reason: ProductionPlanImportBatchNotActivatableReason;

  constructor(
    batchId: string,
    reason: ProductionPlanImportBatchNotActivatableReason
  ) {
    super(
      `Production plan import batch "${batchId}" is not eligible for activation: ${activationNotActivatableDetail(reason)}.`
    );
    this.name = "ProductionPlanImportBatchNotActivatableError";
    this.reason = reason;
  }
}

export class ProductionPlanImportBatchActivationConflictError extends Error {
  constructor(batchId: string) {
    super(
      `Production plan import batch "${batchId}" could not be activated because another batch became active for the same week concurrently.`
    );
    this.name = "ProductionPlanImportBatchActivationConflictError";
  }
}

export class ActiveProductionPlanBatchMustRemainEligibleError extends Error {
  constructor(batchId: string) {
    super(
      `Production plan import batch "${batchId}" must retain at least one valid row while active.`
    );
    this.name = "ActiveProductionPlanBatchMustRemainEligibleError";
  }
}

export type CreateProductionPlanImportBatchRecord = {
  fileName: string;
  sheetName: string;
  planYear: number | null;
  weekNumber: number;
  status: ProductionPlanImportBatchStatus;
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  rows: CreateProductionPlanRowRecord[];
};

export type CreateProductionPlanRowRecord = {
  rowIndex: number;
  sourceRowJson: Record<string, unknown>;
  weekRaw: string | null;
  weekNumber: number | null;
  customerName: string | null;
  orderingPartyCode: string | null;
  customerOrderNumber: string | null;
  customerOrderItemNumber: string | null;
  workOrderNumber: string | null;
  materialCode: string | null;
  materialName: string | null;
  materialColor: string | null;
  materialSize: string | null;
  mainProfileCode: string | null;
  quantity: number | null;
  orderUnit: string | null;
  plannedFinishDate: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  priority: string | null;
  priorityLevel: number | null;
  isValid: boolean;
  validationErrors: string[];
};

export type UpdateProductionPlanRowRecord = Omit<
  CreateProductionPlanRowRecord,
  "rowIndex" | "sourceRowJson"
>;

export type UpdateProductionPlanRowResult = {
  batch: ProductionPlanImportBatch;
  row: ProductionPlanRow;
};

export type ActiveProductionPlanBatchRowsResult = {
  batch: ProductionPlanImportBatch;
  rows: ProductionPlanRow[];
};

@Injectable()
export class ProductionPlanImportsRepository {
  private readonly databaseClient: ProductionPlanDatabase;

  constructor(
    @Inject(DATABASE_CLIENT)
    databaseClient: ProductionPlanDatabase
  ) {
    this.databaseClient = databaseClient;
  }

  async createImportBatch(
    input: CreateProductionPlanImportBatchRecord
  ): Promise<ProductionPlanImportBatch> {
    return this.databaseClient.transaction(async (transaction) => {
      const batchId = randomUUID();
      const [createdBatch] = await transaction
        .insert(productionPlanImportBatches)
        .values({
          id: batchId,
          fileName: input.fileName,
          sheetName: input.sheetName,
          planYear: input.planYear,
          weekNumber: input.weekNumber,
          status: input.status,
          totalRowCount: input.totalRowCount,
          validRowCount: input.validRowCount,
          invalidRowCount: input.invalidRowCount,
          activatedAt: null
        })
        .returning();

      if (!createdBatch) {
        throw new Error("Failed to create production plan import batch.");
      }

      for (const rowChunk of this.chunkRows(input.rows, INSERT_CHUNK_SIZE)) {
        await transaction.insert(productionPlanRows).values(
          rowChunk.map((row) => ({
            id: randomUUID(),
            batchId,
            rowIndex: row.rowIndex,
            sourceRowJson: row.sourceRowJson,
            weekRaw: row.weekRaw,
            weekNumber: row.weekNumber,
            customerName: row.customerName,
            orderingPartyCode: row.orderingPartyCode,
            customerOrderNumber: row.customerOrderNumber,
            customerOrderItemNumber: row.customerOrderItemNumber,
            workOrderNumber: row.workOrderNumber,
            materialCode: row.materialCode,
            materialName: row.materialName,
            materialColor: row.materialColor,
            materialSize: row.materialSize,
            mainProfileCode: row.mainProfileCode,
            quantity: row.quantity,
            orderUnit: row.orderUnit,
            plannedFinishDate: row.plannedFinishDate,
            departmentCode: row.departmentCode,
            departmentName: row.departmentName,
            priority: row.priority,
            priorityLevel: row.priorityLevel,
            isValid: row.isValid,
            validationErrors: row.validationErrors
          }))
        );
      }

      return createdBatch;
    });
  }

  async findImportBatches(): Promise<ProductionPlanImportBatch[]> {
    return this.databaseClient
      .select()
      .from(productionPlanImportBatches)
      .orderBy(desc(productionPlanImportBatches.createdAt));
  }

  async findImportBatchesByWeekNumber(
    weekNumber: number
  ): Promise<ProductionPlanImportBatch[]> {
    return this.databaseClient
      .select()
      .from(productionPlanImportBatches)
      .where(eq(productionPlanImportBatches.weekNumber, weekNumber))
      .orderBy(
        asc(sql<number>`
          case
            when ${productionPlanImportBatches.status} = 'active' then 0
            when ${productionPlanImportBatches.status} = 'imported' then 1
            when ${productionPlanImportBatches.status} = 'superseded' then 2
            else 3
          end
        `),
        desc(productionPlanImportBatches.createdAt)
      );
  }

  async findImportBatchById(id: string): Promise<ProductionPlanImportBatch | null> {
    const [batch] = await this.databaseClient
      .select()
      .from(productionPlanImportBatches)
      .where(eq(productionPlanImportBatches.id, id))
      .limit(1);

    return batch ?? null;
  }

  async findActiveBatchByWeekNumber(
    weekNumber: number
  ): Promise<ProductionPlanImportBatch | null> {
    const [batch] = await this.databaseClient
      .select()
      .from(productionPlanImportBatches)
      .where(
        and(
          eq(productionPlanImportBatches.weekNumber, weekNumber),
          eq(productionPlanImportBatches.status, "active")
        )
      )
      .limit(1);

    return batch ?? null;
  }

  async findActiveBatchRowsByWeekNumber(
    weekNumber: number
  ): Promise<ActiveProductionPlanBatchRowsResult | null> {
    const batch = await this.findActiveBatchByWeekNumber(weekNumber);

    if (!batch) {
      return null;
    }

    const rows = await this.findRowsByBatchId(batch.id);

    return {
      batch,
      rows
    };
  }

  async activateBatchById(id: string): Promise<ProductionPlanImportBatch | null> {
    try {
      return await this.databaseClient.transaction(async (transaction) => {
        const [targetBatch] = await transaction
          .select()
          .from(productionPlanImportBatches)
          .where(eq(productionPlanImportBatches.id, id))
          .limit(1);

        if (!targetBatch) {
          return null;
        }

        if (targetBatch.status === "active") {
          return targetBatch;
        }

        let batch = await this.syncBatchSummaryFromRows(transaction, id);

        if (!batch) {
          throw new Error(`Failed to sync production plan batch "${id}".`);
        }

        if (batch.weekNumber === null && batch.validRowCount > 0) {
          batch = await this.inferBatchWeekFromValidRowsIfMissing(
            transaction,
            id,
            batch
          );
        }

        if (batch.planYear === null && batch.validRowCount > 0) {
          batch = await this.inferBatchPlanYearFromValidRowsIfMissing(
            transaction,
            id,
            batch
          );
        }

        if (batch.validRowCount <= 0) {
          throw new ProductionPlanImportBatchNotActivatableError(
            id,
            "no_valid_rows"
          );
        }

        if (batch.weekNumber === null) {
          throw new ProductionPlanImportBatchNotActivatableError(
            id,
            "missing_week"
          );
        }

        if (batch.planYear === null) {
          throw new ProductionPlanImportBatchNotActivatableError(
            id,
            "missing_year"
          );
        }

        await transaction
          .update(productionPlanImportBatches)
          .set({
            status: "superseded",
            updatedAt: sql`now()`
          })
          .where(
            and(
              eq(productionPlanImportBatches.weekNumber, batch.weekNumber),
              eq(productionPlanImportBatches.planYear, batch.planYear),
              eq(productionPlanImportBatches.status, "active")
            )
          );

        const [activatedBatch] = await transaction
          .update(productionPlanImportBatches)
          .set({
            status: "active",
            activatedAt: sql`now()`,
            updatedAt: sql`now()`
          })
          .where(eq(productionPlanImportBatches.id, id))
          .returning();

        if (!activatedBatch) {
          throw new Error(`Failed to activate production plan batch "${id}".`);
        }

        await transaction.insert(productionPlanOutboxEvents).values({
          id: randomUUID(),
          eventType: routingKeys.productionPlanBatchActivated,
          aggregateId: activatedBatch.id,
          payloadJson: this.toBatchActivatedEvent(activatedBatch),
          status: "pending",
          attempts: 0,
          nextAttemptAt: sql`now()`
        });

        return activatedBatch;
      });
    } catch (error) {
      if (isActiveBatchPerWeekUniqueViolation(error)) {
        throw new ProductionPlanImportBatchActivationConflictError(id);
      }

      throw error;
    }
  }

  async findRowsByBatchId(batchId: string): Promise<ProductionPlanRow[]> {
    return this.databaseClient
      .select()
      .from(productionPlanRows)
      .where(eq(productionPlanRows.batchId, batchId))
      .orderBy(asc(productionPlanRows.rowIndex));
  }

  async countRowsByBatchId(batchId: string): Promise<number> {
    const [row] = await this.databaseClient
      .select({ total: count() })
      .from(productionPlanRows)
      .where(eq(productionPlanRows.batchId, batchId));

    return Number(row?.total ?? 0);
  }

  async findRowsByBatchIdPage(
    batchId: string,
    limit: number,
    offset: number
  ): Promise<ProductionPlanRow[]> {
    return this.databaseClient
      .select()
      .from(productionPlanRows)
      .where(eq(productionPlanRows.batchId, batchId))
      .orderBy(asc(productionPlanRows.rowIndex))
      .limit(limit)
      .offset(offset);
  }

  async deleteBatchById(id: string): Promise<ProductionPlanImportBatch | null> {
    return this.databaseClient.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(productionPlanImportBatches)
        .where(eq(productionPlanImportBatches.id, id))
        .limit(1);

      if (!existing) {
        return null;
      }

      await transaction
        .delete(productionPlanImportBatches)
        .where(eq(productionPlanImportBatches.id, id));

      return existing;
    });
  }

  async findRowById(id: string): Promise<ProductionPlanRow | null> {
    const [row] = await this.databaseClient
      .select()
      .from(productionPlanRows)
      .where(eq(productionPlanRows.id, id))
      .limit(1);

    return row ?? null;
  }

  async updateRowAndRefreshBatchSummary(
    id: string,
    input: UpdateProductionPlanRowRecord
  ): Promise<UpdateProductionPlanRowResult | null> {
    return this.databaseClient.transaction(async (transaction) => {
      const [existingRow] = await transaction
        .select()
        .from(productionPlanRows)
        .where(eq(productionPlanRows.id, id))
        .limit(1);

      if (!existingRow) {
        return null;
      }

      const [existingBatch] = await transaction
        .select()
        .from(productionPlanImportBatches)
        .where(eq(productionPlanImportBatches.id, existingRow.batchId))
        .limit(1);

      if (!existingBatch) {
        throw new Error(
          `Failed to load production plan batch "${existingRow.batchId}".`
        );
      }

      const [updatedRow] = await transaction
        .update(productionPlanRows)
        .set({
          weekRaw: input.weekRaw,
          weekNumber: input.weekNumber,
          customerName: input.customerName,
          orderingPartyCode: input.orderingPartyCode,
          customerOrderNumber: input.customerOrderNumber,
          customerOrderItemNumber: input.customerOrderItemNumber,
          workOrderNumber: input.workOrderNumber,
          materialCode: input.materialCode,
          materialName: input.materialName,
          materialColor: input.materialColor,
          materialSize: input.materialSize,
          mainProfileCode: input.mainProfileCode,
          quantity: input.quantity,
          orderUnit: input.orderUnit,
          plannedFinishDate: input.plannedFinishDate,
          departmentCode: input.departmentCode,
          departmentName: input.departmentName,
          priority: input.priority,
          priorityLevel: input.priorityLevel,
          isValid: input.isValid,
          validationErrors: input.validationErrors,
          updatedAt: sql`now()`
        })
        .where(eq(productionPlanRows.id, id))
        .returning();

      if (!updatedRow) {
        return null;
      }

      const [summary] = await transaction
        .select({
          totalRowCount: sql<number>`count(*)::int`,
          validRowCount:
            sql<number>`coalesce(sum(case when ${productionPlanRows.isValid} then 1 else 0 end), 0)::int`,
          invalidRowCount:
            sql<number>`coalesce(sum(case when ${productionPlanRows.isValid} then 0 else 1 end), 0)::int`
        })
        .from(productionPlanRows)
        .where(eq(productionPlanRows.batchId, updatedRow.batchId));

      const invalidRowCount = summary?.invalidRowCount ?? 0;
      const validRowCount = summary?.validRowCount ?? 0;
      const totalRowCount = summary?.totalRowCount ?? 0;

      if (existingBatch.status === "active" && validRowCount === 0) {
        throw new ActiveProductionPlanBatchMustRemainEligibleError(
          existingBatch.id
        );
      }

      const [updatedBatch] = await transaction
        .update(productionPlanImportBatches)
        .set({
          totalRowCount,
          validRowCount,
          invalidRowCount,
          updatedAt: sql`now()`
        })
        .where(eq(productionPlanImportBatches.id, updatedRow.batchId))
        .returning();

      if (!updatedBatch) {
        throw new Error(
          `Failed to refresh production plan batch "${updatedRow.batchId}".`
        );
      }

      if (this.isBatchEligibleForCutListReconcile(updatedBatch)) {
        await this.replacePendingCutListReconcileOutbox(
          transaction,
          updatedBatch,
          updatedBatch.updatedAt
        );
      }

      return {
        row: updatedRow,
        batch: updatedBatch
      };
    });
  }

  /**
   * Re-queues a pending `production-plan.batch.cut-list-reconcile` outbox row for every
   * currently active batch that has a resolved plan year and week (same rule as row PATCH).
   * Used when master data changes so cut-list snapshots can re-match without editing rows.
   */
  async enqueueCutListReconcileForAllEligibleActiveBatches(): Promise<number> {
    const batches = await this.findActiveBatchesEligibleForCutListReconcile();

    if (batches.length === 0) {
      return 0;
    }

    const occurredAt = new Date().toISOString();

    await this.databaseClient.transaction(async (transaction) => {
      for (const batch of batches) {
        await this.replacePendingCutListReconcileOutbox(
          transaction,
          batch,
          occurredAt
        );
      }
    });

    return batches.length;
  }

  private findActiveBatchesEligibleForCutListReconcile(): Promise<
    ProductionPlanImportBatch[]
  > {
    return this.databaseClient
      .select()
      .from(productionPlanImportBatches)
      .where(
        and(
          eq(productionPlanImportBatches.status, "active"),
          isNotNull(productionPlanImportBatches.planYear),
          isNotNull(productionPlanImportBatches.weekNumber)
        )
      );
  }

  private isBatchEligibleForCutListReconcile(
    batch: ProductionPlanImportBatch
  ): batch is ProductionPlanImportBatch & {
    planYear: number;
    weekNumber: number;
  } {
    return (
      batch.status === "active" &&
      batch.planYear !== null &&
      batch.weekNumber !== null
    );
  }

  private async replacePendingCutListReconcileOutbox(
    transaction: ProductionPlanDatabase,
    batch: ProductionPlanImportBatch,
    occurredAt: string
  ): Promise<void> {
    if (!this.isBatchEligibleForCutListReconcile(batch)) {
      return;
    }

    await transaction
      .delete(productionPlanOutboxEvents)
      .where(
        and(
          eq(productionPlanOutboxEvents.aggregateId, batch.id),
          eq(
            productionPlanOutboxEvents.eventType,
            routingKeys.productionPlanBatchCutListReconcile
          ),
          eq(productionPlanOutboxEvents.status, "pending")
        )
      );

    await transaction.insert(productionPlanOutboxEvents).values({
      id: randomUUID(),
      eventType: routingKeys.productionPlanBatchCutListReconcile,
      aggregateId: batch.id,
      payloadJson: this.toBatchCutListReconcileEvent(batch, occurredAt),
      status: "pending",
      attempts: 0,
      nextAttemptAt: sql`now()`
    });
  }

  async findDueOutboxEvents(limit = 10): Promise<ProductionPlanOutboxEvent[]> {
    return this.databaseClient
      .select()
      .from(productionPlanOutboxEvents)
      .where(
        and(
          inArray(productionPlanOutboxEvents.status, ["pending", "retry"]),
          lte(productionPlanOutboxEvents.nextAttemptAt, sql`now()`)
        )
      )
      .orderBy(asc(productionPlanOutboxEvents.createdAt))
      .limit(limit);
  }

  /**
   * Active batches that predate the outbox table (or were activated without an outbox row)
   * never emit `production-plan.batch.activated`, so cut-list snapshots are never created.
   * This is idempotent: skips batches that already have any outbox row for this event type.
   */
  async backfillMissingActivatedOutboxEvents(): Promise<number> {
    const activeBatches = await this.databaseClient
      .select()
      .from(productionPlanImportBatches)
      .where(
        and(
          eq(productionPlanImportBatches.status, "active"),
          isNotNull(productionPlanImportBatches.planYear),
          isNotNull(productionPlanImportBatches.weekNumber),
          isNotNull(productionPlanImportBatches.activatedAt)
        )
      );

    let inserted = 0;

    for (const batch of activeBatches) {
      if (
        batch.planYear === null ||
        batch.weekNumber === null ||
        !batch.activatedAt
      ) {
        continue;
      }

      const [existing] = await this.databaseClient
        .select({ id: productionPlanOutboxEvents.id })
        .from(productionPlanOutboxEvents)
        .where(
          and(
            eq(productionPlanOutboxEvents.aggregateId, batch.id),
            eq(
              productionPlanOutboxEvents.eventType,
              routingKeys.productionPlanBatchActivated
            )
          )
        )
        .limit(1);

      if (existing) {
        continue;
      }

      await this.databaseClient.insert(productionPlanOutboxEvents).values({
        id: randomUUID(),
        eventType: routingKeys.productionPlanBatchActivated,
        aggregateId: batch.id,
        payloadJson: this.toBatchActivatedEvent(batch),
        status: "pending",
        attempts: 0,
        nextAttemptAt: sql`now()`
      });
      inserted += 1;
    }

    return inserted;
  }

  async markOutboxEventPublished(id: string): Promise<void> {
    await this.databaseClient
      .update(productionPlanOutboxEvents)
      .set({
        status: "published",
        publishedAt: sql`now()`
      })
      .where(eq(productionPlanOutboxEvents.id, id));
  }

  async markOutboxEventFailed(
    id: string,
    attempts: number,
    maxAttempts: number,
    retryDelayMs: number
  ): Promise<void> {
    await this.databaseClient
      .update(productionPlanOutboxEvents)
      .set({
        status: attempts + 1 >= maxAttempts ? "failed" : "retry",
        attempts: attempts + 1,
        nextAttemptAt: sql`now() + ${retryDelayMs} * interval '1 millisecond'`
      })
      .where(eq(productionPlanOutboxEvents.id, id));
  }

  private async syncBatchSummaryFromRows(
    transaction: ProductionPlanDatabase,
    batchId: string
  ): Promise<ProductionPlanImportBatch | null> {
    const [summary] = await transaction
      .select({
        totalRowCount: sql<number>`count(*)::int`,
        validRowCount:
          sql<number>`coalesce(sum(case when ${productionPlanRows.isValid} then 1 else 0 end), 0)::int`,
        invalidRowCount:
          sql<number>`coalesce(sum(case when ${productionPlanRows.isValid} then 0 else 1 end), 0)::int`
      })
      .from(productionPlanRows)
      .where(eq(productionPlanRows.batchId, batchId));

    const totalRowCount = summary?.totalRowCount ?? 0;
    const validRowCount = summary?.validRowCount ?? 0;
    const invalidRowCount = summary?.invalidRowCount ?? 0;

    const [updatedBatch] = await transaction
      .update(productionPlanImportBatches)
      .set({
        totalRowCount,
        validRowCount,
        invalidRowCount,
        updatedAt: sql`now()`
      })
      .where(eq(productionPlanImportBatches.id, batchId))
      .returning();

    return updatedBatch ?? null;
  }

  private async inferBatchWeekFromValidRowsIfMissing(
    transaction: ProductionPlanDatabase,
    batchId: string,
    batch: ProductionPlanImportBatch
  ): Promise<ProductionPlanImportBatch> {
    if (batch.weekNumber !== null) {
      return batch;
    }

    const weekRows = await transaction
      .selectDistinct({
        weekNumber: productionPlanRows.weekNumber
      })
      .from(productionPlanRows)
      .where(
        and(
          eq(productionPlanRows.batchId, batchId),
          eq(productionPlanRows.isValid, true),
          isNotNull(productionPlanRows.weekNumber)
        )
      );

    const distinctWeeks = weekRows
      .map((row) => row.weekNumber)
      .filter((week): week is number => typeof week === "number");

    if (distinctWeeks.length === 0) {
      throw new ProductionPlanImportBatchNotActivatableError(
        batchId,
        "missing_week"
      );
    }

    if (distinctWeeks.length > 1) {
      throw new ProductionPlanImportBatchNotActivatableError(
        batchId,
        "conflicting_weeks"
      );
    }

    const [resolvedWeek] = distinctWeeks;

    if (resolvedWeek === undefined) {
      throw new ProductionPlanImportBatchNotActivatableError(
        batchId,
        "missing_week"
      );
    }

    const [updatedBatch] = await transaction
      .update(productionPlanImportBatches)
      .set({
        weekNumber: resolvedWeek,
        updatedAt: sql`now()`
      })
      .where(eq(productionPlanImportBatches.id, batchId))
      .returning();

    if (!updatedBatch) {
      throw new Error(
        `Failed to infer week for production plan batch "${batchId}".`
      );
    }

    return updatedBatch;
  }

  private async inferBatchPlanYearFromValidRowsIfMissing(
    transaction: ProductionPlanDatabase,
    batchId: string,
    batch: ProductionPlanImportBatch
  ): Promise<ProductionPlanImportBatch> {
    if (batch.planYear !== null) {
      return batch;
    }

    const yearRows = await transaction
      .selectDistinct({
        planYear: sql<number>`to_char(${productionPlanRows.plannedFinishDate}, 'IYYY')::int`
      })
      .from(productionPlanRows)
      .where(
        and(
          eq(productionPlanRows.batchId, batchId),
          eq(productionPlanRows.isValid, true),
          isNotNull(productionPlanRows.plannedFinishDate)
        )
      );

    const distinctYears = yearRows
      .map((row) => row.planYear)
      .filter((planYear): planYear is number => typeof planYear === "number");

    if (distinctYears.length === 0) {
      throw new ProductionPlanImportBatchNotActivatableError(
        batchId,
        "missing_year"
      );
    }

    if (distinctYears.length > 1) {
      throw new ProductionPlanImportBatchNotActivatableError(
        batchId,
        "conflicting_years"
      );
    }

    const [resolvedPlanYear] = distinctYears;

    if (resolvedPlanYear === undefined) {
      throw new ProductionPlanImportBatchNotActivatableError(
        batchId,
        "missing_year"
      );
    }

    const [updatedBatch] = await transaction
      .update(productionPlanImportBatches)
      .set({
        planYear: resolvedPlanYear,
        updatedAt: sql`now()`
      })
      .where(eq(productionPlanImportBatches.id, batchId))
      .returning();

    if (!updatedBatch) {
      throw new Error(
        `Failed to infer plan year for production plan batch "${batchId}".`
      );
    }

    return updatedBatch;
  }

  private toBatchCutListReconcileEvent(
    batch: ProductionPlanImportBatch,
    occurredAt: string
  ): ProductionPlanBatchCutListReconcileEvent {
    if (batch.planYear === null || batch.weekNumber === null) {
      throw new Error(
        `Active production plan batch "${batch.id}" is missing reconcile event fields.`
      );
    }

    const messageId = randomUUID();

    return {
      metadata: {
        messageId,
        correlationId: messageId,
        causationId: batch.id,
        attempt: 1,
        occurredAt
      },
      sourceBatchId: batch.id,
      planYear: batch.planYear,
      weekNumber: batch.weekNumber,
      occurredAt
    };
  }

  private toBatchActivatedEvent(
    batch: ProductionPlanImportBatch
  ): ProductionPlanBatchActivatedEvent {
    if (batch.planYear === null || batch.weekNumber === null || !batch.activatedAt) {
      throw new Error(
        `Activated production plan batch "${batch.id}" is missing event fields.`
      );
    }

    const messageId = randomUUID();

    return {
      metadata: {
        messageId,
        correlationId: messageId,
        causationId: batch.id,
        attempt: 1,
        occurredAt: batch.activatedAt
      },
      sourceBatchId: batch.id,
      planYear: batch.planYear,
      weekNumber: batch.weekNumber,
      activatedAt: batch.activatedAt
    };
  }

  private chunkRows<T>(rows: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];

    for (let index = 0; index < rows.length; index += chunkSize) {
      chunks.push(rows.slice(index, index + chunkSize));
    }

    return chunks;
  }
}

type PostgresConstraintError = {
  code?: string;
  constraint?: string;
};

function isActiveBatchPerWeekUniqueViolation(
  error: unknown
): error is PostgresConstraintError {
  if (!error || typeof error !== "object") {
    return false;
  }

  const { code, constraint } = error as PostgresConstraintError;

  return (
    code === POSTGRES_UNIQUE_VIOLATION_CODE &&
    constraint === ACTIVE_BATCH_PER_WEEK_UNIQUE_INDEX
  );
}
