import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { DATABASE_CLIENT } from "../../infrastructure/db/database.tokens";
import type { ProductionPlanDatabase } from "../../infrastructure/db/client";
import {
  productionPlanImportBatches,
  productionPlanRows,
  type ProductionPlanImportBatch,
  type ProductionPlanImportBatchStatus,
  type ProductionPlanRow
} from "../../infrastructure/db/schema";

const INSERT_CHUNK_SIZE = 500;

export class ProductionPlanImportBatchNotActivatableError extends Error {
  constructor(batchId: string) {
    super(
      `Production plan import batch "${batchId}" is not eligible for activation.`
    );
    this.name = "ProductionPlanImportBatchNotActivatableError";
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
  quantity: number | null;
  orderUnit: string | null;
  plannedFinishDate: string | null;
  departmentCode: string | null;
  priority: string | null;
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
            quantity: row.quantity,
            orderUnit: row.orderUnit,
            plannedFinishDate: row.plannedFinishDate,
            departmentCode: row.departmentCode,
            priority: row.priority,
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

  async activateBatchById(id: string): Promise<ProductionPlanImportBatch | null> {
    return this.databaseClient.transaction(async (transaction) => {
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

      if (targetBatch.weekNumber === null || targetBatch.validRowCount <= 0) {
        throw new ProductionPlanImportBatchNotActivatableError(id);
      }

      await transaction
        .update(productionPlanImportBatches)
        .set({
          status: "superseded",
          updatedAt: sql`now()`
        })
        .where(
          and(
            eq(productionPlanImportBatches.weekNumber, targetBatch.weekNumber),
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

      return activatedBatch;
    });
  }

  async findRowsByBatchId(batchId: string): Promise<ProductionPlanRow[]> {
    return this.databaseClient
      .select()
      .from(productionPlanRows)
      .where(eq(productionPlanRows.batchId, batchId))
      .orderBy(asc(productionPlanRows.rowIndex));
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
          quantity: input.quantity,
          orderUnit: input.orderUnit,
          plannedFinishDate: input.plannedFinishDate,
          departmentCode: input.departmentCode,
          priority: input.priority,
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

      return {
        row: updatedRow,
        batch: updatedBatch
      };
    });
  }

  private chunkRows<T>(rows: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];

    for (let index = 0; index < rows.length; index += chunkSize) {
      chunks.push(rows.slice(index, index + chunkSize));
    }

    return chunks;
  }
}
