import path from "node:path";

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import type { ProductionPlanImportBatchStatus } from "@lemnixpro/shared-contracts";

import type {
  ProductionPlanImportBatch,
  ProductionPlanRow
} from "../../infrastructure/db/schema";

import {
  ProductionPlanActiveBatchRowResponseDto,
  ProductionPlanActiveBatchRowsResponseDto
} from "./dto/production-plan-active-batch-rows-response.dto";
import { ProductionPlanImportBatchDetailResponseDto } from "./dto/production-plan-import-batch-detail-response.dto";
import { ProductionPlanImportBatchResponseDto } from "./dto/production-plan-import-batch-response.dto";
import { ProductionPlanImportRowResponseDto } from "./dto/production-plan-import-row-response.dto";
import { ProductionPlanImportRowsPageResponseDto } from "./dto/production-plan-import-rows-page-response.dto";
import type { UpdateProductionPlanRowRequestDto } from "./dto/update-production-plan-row-request.dto";
import {
  MAX_IMPORT_FILE_SIZE_BYTES,
  ProductionPlanImportParser,
  type NormalizedProductionPlanRow,
  type ProductionPlanRowCandidate
} from "./production-plan-import.parser";
import {
  ActiveProductionPlanBatchMustRemainEligibleError,
  ProductionPlanImportBatchActivationConflictError,
  ProductionPlanImportBatchNotActivatableError,
  ProductionPlanImportsRepository
} from "./production-plan-imports.repository";

export type UploadedProductionPlanImportFile = {
  originalname: string;
  size: number;
  buffer: Buffer;
  mimetype?: string;
};

@Injectable()
export class ProductionPlanImportsService {
  private readonly productionPlanImportParser: ProductionPlanImportParser;
  private readonly productionPlanImportsRepository: ProductionPlanImportsRepository;

  constructor(
    @Inject(ProductionPlanImportParser)
    productionPlanImportParser: ProductionPlanImportParser,
    @Inject(ProductionPlanImportsRepository)
    productionPlanImportsRepository: ProductionPlanImportsRepository
  ) {
    this.productionPlanImportParser = productionPlanImportParser;
    this.productionPlanImportsRepository = productionPlanImportsRepository;
  }

  /**
   * Internal: enqueue cut-list reconcile for every active imported batch that can be reconciled.
   */
  async enqueueCutListReconcileForAllActiveBatches(): Promise<{
    enqueuedBatchCount: number;
  }> {
    const enqueuedBatchCount =
      await this.productionPlanImportsRepository.enqueueCutListReconcileForAllEligibleActiveBatches();

    return { enqueuedBatchCount };
  }

  async createImport(
    file: UploadedProductionPlanImportFile | undefined
  ): Promise<ProductionPlanImportBatchResponseDto> {
    const normalizedFile = this.validateAndNormalizeUpload(file);
    const parsedImport = this.productionPlanImportParser.parseWorkbook(
      normalizedFile.originalname,
      normalizedFile.buffer
    );

    const batchWeekNumber = this.resolveBatchWeekNumber(parsedImport.rows);
    const batchPlanYear = this.resolveBatchPlanYear(parsedImport.rows);

    const createdBatch =
      await this.productionPlanImportsRepository.createImportBatch({
        fileName: normalizedFile.originalname,
        sheetName: parsedImport.sheetName,
        planYear: batchPlanYear,
        weekNumber: batchWeekNumber,
        status: "imported",
        totalRowCount: parsedImport.totalRowCount,
        validRowCount: parsedImport.validRowCount,
        invalidRowCount: parsedImport.invalidRowCount,
        rows: parsedImport.rows.map((row) => ({
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
      });

    return this.toBatchResponse(createdBatch);
  }

  async findAllImports(): Promise<ProductionPlanImportBatchResponseDto[]> {
    const batches = await this.productionPlanImportsRepository.findImportBatches();

    return batches.map((batch) => this.toBatchResponse(batch));
  }

  async findImportsByWeekNumber(
    weekNumber: number
  ): Promise<ProductionPlanImportBatchResponseDto[]> {
    const batches =
      await this.productionPlanImportsRepository.findImportBatchesByWeekNumber(
        weekNumber
      );

    return batches.map((batch) => this.toBatchResponse(batch));
  }

  async findImportById(
    id: string
  ): Promise<ProductionPlanImportBatchDetailResponseDto> {
    const batch = await this.productionPlanImportsRepository.findImportBatchById(id);

    if (!batch) {
      throw new NotFoundException(
        `Production plan import batch "${id}" was not found.`
      );
    }

    return this.toBatchDetailResponse(batch);
  }

  async findRowsByBatchId(id: string): Promise<ProductionPlanImportRowResponseDto[]> {
    const batch = await this.productionPlanImportsRepository.findImportBatchById(id);

    if (!batch) {
      throw new NotFoundException(
        `Production plan import batch "${id}" was not found.`
      );
    }

    const rows = await this.productionPlanImportsRepository.findRowsByBatchId(id);

    return rows.map((row) => this.toRowResponse(row));
  }

  async findRowsByBatchIdPaged(
    id: string,
    limitInput: number,
    offsetInput: number
  ): Promise<ProductionPlanImportRowsPageResponseDto> {
    const batch = await this.productionPlanImportsRepository.findImportBatchById(id);

    if (!batch) {
      throw new NotFoundException(
        `Production plan import batch "${id}" was not found.`
      );
    }

    const limit = Math.min(500, Math.max(1, limitInput));
    const offset = Math.max(0, offsetInput);

    const totalCount =
      await this.productionPlanImportsRepository.countRowsByBatchId(id);
    const rows =
      await this.productionPlanImportsRepository.findRowsByBatchIdPage(
        id,
        limit,
        offset
      );

    return {
      rows: rows.map((row) => this.toRowResponse(row)),
      totalCount,
      limit,
      offset
    };
  }

  async deleteImport(id: string): Promise<void> {
    const deleted =
      await this.productionPlanImportsRepository.deleteBatchById(id);

    if (!deleted) {
      throw new NotFoundException(
        `Production plan import batch "${id}" was not found.`
      );
    }
  }

  async activateImport(id: string): Promise<ProductionPlanImportBatchResponseDto> {
    try {
      const activatedBatch =
        await this.productionPlanImportsRepository.activateBatchById(id);

      if (!activatedBatch) {
        throw new NotFoundException(
          `Production plan import batch "${id}" was not found.`
        );
      }

      return this.toBatchResponse(activatedBatch);
    } catch (error) {
      if (
        error instanceof ProductionPlanImportBatchNotActivatableError ||
        error instanceof ProductionPlanImportBatchActivationConflictError
      ) {
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }

  async findActiveBatchByWeekNumber(
    weekNumber: number
  ): Promise<ProductionPlanImportBatchResponseDto> {
    const batch =
      await this.productionPlanImportsRepository.findActiveBatchByWeekNumber(
        weekNumber
      );

    if (!batch) {
      throw new NotFoundException(
        `No active production plan import batch exists for week "${weekNumber}".`
      );
    }

    return this.toBatchResponse(batch);
  }

  async findActiveBatchRowsByWeekNumber(
    weekNumber: number
  ): Promise<ProductionPlanActiveBatchRowsResponseDto> {
    const activeBatchRows =
      await this.productionPlanImportsRepository.findActiveBatchRowsByWeekNumber(
        weekNumber
      );

    if (!activeBatchRows) {
      throw new NotFoundException(
        `No active production plan import batch exists for week "${weekNumber}".`
      );
    }

    return {
      batch: this.toBatchResponse(activeBatchRows.batch),
      rows: activeBatchRows.rows.map((row) => this.toActiveBatchRowResponse(row))
    };
  }

  async updateRow(
    id: string,
    request: UpdateProductionPlanRowRequestDto
  ): Promise<ProductionPlanImportRowResponseDto> {
    if (Object.keys(request).length === 0) {
      throw new BadRequestException(
        "At least one editable production plan row field must be provided."
      );
    }

    const existingRow = await this.productionPlanImportsRepository.findRowById(id);

    if (!existingRow) {
      throw new NotFoundException(`Production plan row "${id}" was not found.`);
    }

    const normalizedRow = this.productionPlanImportParser.normalizePatchedRow(
      this.buildPatchedRowCandidate(existingRow, request),
      existingRow.sourceRowJson,
      existingRow.rowIndex
    );

    let updatedRowResult;

    try {
      updatedRowResult =
        await this.productionPlanImportsRepository.updateRowAndRefreshBatchSummary(
          id,
          {
            weekRaw: normalizedRow.weekRaw,
            weekNumber: normalizedRow.weekNumber,
            customerName: normalizedRow.customerName,
            orderingPartyCode: normalizedRow.orderingPartyCode,
            customerOrderNumber: normalizedRow.customerOrderNumber,
            customerOrderItemNumber: normalizedRow.customerOrderItemNumber,
            workOrderNumber: normalizedRow.workOrderNumber,
            materialCode: normalizedRow.materialCode,
            materialName: normalizedRow.materialName,
            materialColor: normalizedRow.materialColor,
            materialSize: normalizedRow.materialSize,
            mainProfileCode: normalizedRow.mainProfileCode,
            quantity: normalizedRow.quantity,
            orderUnit: normalizedRow.orderUnit,
            plannedFinishDate: normalizedRow.plannedFinishDate,
            departmentCode: normalizedRow.departmentCode,
            departmentName: normalizedRow.departmentName,
            priority: normalizedRow.priority,
            priorityLevel: normalizedRow.priorityLevel,
            isValid: normalizedRow.isValid,
            validationErrors: normalizedRow.validationErrors
          }
        );
    } catch (error) {
      if (error instanceof ActiveProductionPlanBatchMustRemainEligibleError) {
        throw new ConflictException(error.message);
      }

      throw error;
    }

    if (!updatedRowResult) {
      throw new NotFoundException(`Production plan row "${id}" was not found.`);
    }

    return this.toRowResponse(updatedRowResult.row);
  }

  private validateAndNormalizeUpload(
    file: UploadedProductionPlanImportFile | undefined
  ): UploadedProductionPlanImportFile {
    if (!file) {
      throw new BadRequestException("An .xlsx file upload is required.");
    }

    const normalizedFileName = path.basename(file.originalname).trim();

    if (normalizedFileName === "") {
      throw new BadRequestException("The uploaded file name is invalid.");
    }

    if (path.extname(normalizedFileName).toLowerCase() !== ".xlsx") {
      throw new BadRequestException("Only .xlsx production plan uploads are supported.");
    }

    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || file.size === 0) {
      throw new BadRequestException("The uploaded file is empty.");
    }

    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `The uploaded file exceeds the ${MAX_IMPORT_FILE_SIZE_BYTES} byte size limit.`
      );
    }

    return {
      ...file,
      originalname: normalizedFileName
    };
  }

  private buildPatchedRowCandidate(
    existingRow: ProductionPlanRow,
    request: UpdateProductionPlanRowRequestDto
  ): ProductionPlanRowCandidate {
    return {
      weekRaw: existingRow.weekRaw,
      customerName:
        request.customerName !== undefined
          ? request.customerName
          : existingRow.customerName,
      orderingPartyCode:
        request.orderingPartyCode !== undefined
          ? request.orderingPartyCode
          : existingRow.orderingPartyCode,
      customerOrderNumber:
        request.customerOrderNumber !== undefined
          ? request.customerOrderNumber
          : existingRow.customerOrderNumber,
      customerOrderItemNumber:
        request.customerOrderItemNumber !== undefined
          ? request.customerOrderItemNumber
          : existingRow.customerOrderItemNumber,
      workOrderNumber:
        request.workOrderNumber !== undefined
          ? request.workOrderNumber
          : existingRow.workOrderNumber,
      materialCode:
        request.materialCode !== undefined
          ? request.materialCode
          : existingRow.materialCode,
      materialName:
        request.materialName !== undefined
          ? request.materialName
          : existingRow.materialName,
      mainProfileCode:
        request.mainProfileCode !== undefined
          ? request.mainProfileCode
          : existingRow.mainProfileCode,
      quantity: request.quantity !== undefined ? request.quantity : existingRow.quantity,
      orderUnit: request.orderUnit !== undefined ? request.orderUnit : existingRow.orderUnit,
      plannedFinishDate:
        request.plannedFinishDate !== undefined
          ? request.plannedFinishDate
          : existingRow.plannedFinishDate,
      departmentCode:
        request.departmentCode !== undefined
          ? request.departmentCode
          : existingRow.departmentCode,
      priority: request.priority !== undefined ? request.priority : existingRow.priority
    };
  }

  private toBatchResponse(
    batch: ProductionPlanImportBatch
  ): ProductionPlanImportBatchResponseDto {
    return {
      id: batch.id,
      fileName: batch.fileName,
      sheetName: batch.sheetName,
      planYear: batch.planYear,
      weekNumber: batch.weekNumber,
      status: batch.status as ProductionPlanImportBatchStatus,
      totalRowCount: batch.totalRowCount,
      validRowCount: batch.validRowCount,
      invalidRowCount: batch.invalidRowCount,
      activatedAt: batch.activatedAt,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt
    };
  }

  private toBatchDetailResponse(
    batch: ProductionPlanImportBatch
  ): ProductionPlanImportBatchDetailResponseDto {
    return this.toBatchResponse(batch);
  }

  private toRowResponse(row: ProductionPlanRow): ProductionPlanImportRowResponseDto {
    return {
      id: row.id,
      batchId: row.batchId,
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
      validationErrors: row.validationErrors,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private toActiveBatchRowResponse(
    row: ProductionPlanRow
  ): ProductionPlanActiveBatchRowResponseDto {
    return {
      id: row.id,
      rowIndex: row.rowIndex,
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
    };
  }

  private resolveBatchWeekNumber(
    rows: NormalizedProductionPlanRow[]
  ): number {
    const authoritativeRows = rows.some((row) => row.isValid)
      ? rows.filter((row) => row.isValid)
      : rows;
    const distinctWeekNumbers = [...new Set(
      authoritativeRows
        .map((row) => row.weekNumber)
        .filter((weekNumber): weekNumber is number => weekNumber !== null)
    )];

    if (distinctWeekNumbers.length === 1) {
      const [resolvedWeekNumber] = distinctWeekNumbers;

      if (resolvedWeekNumber !== undefined) {
        return resolvedWeekNumber;
      }
    }

    if (distinctWeekNumbers.length === 0) {
      throw new BadRequestException(
        "The uploaded worksheet must resolve exactly one authoritative week number."
      );
    }

    throw new BadRequestException(
      "The uploaded worksheet contains conflicting week numbers and cannot be imported."
    );
  }

  private resolveBatchPlanYear(
    rows: NormalizedProductionPlanRow[]
  ): number | null {
    const distinctPlanYears = [...new Set(
      rows
        .filter((row) => row.isValid)
        .map((row) =>
          row.plannedFinishDate
            ? getIsoWeekYearFromDateString(row.plannedFinishDate)
            : null
        )
        .filter((planYear): planYear is number => Number.isInteger(planYear))
    )];

    if (distinctPlanYears.length === 1) {
      const [resolvedPlanYear] = distinctPlanYears;

      if (resolvedPlanYear !== undefined) {
        return resolvedPlanYear;
      }
    }

    if (distinctPlanYears.length === 0) {
      return null;
    }

    throw new BadRequestException(
      "The uploaded worksheet contains conflicting planned finish years and cannot be imported."
    );
  }
}

function getIsoWeekYearFromDateString(dateString: string): number | null {
  const date = new Date(`${dateString}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const dayOfWeek = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);

  return date.getUTCFullYear();
}
