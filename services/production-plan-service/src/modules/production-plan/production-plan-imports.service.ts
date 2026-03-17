import path from "node:path";

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import type {
  ProductionPlanImportBatch,
  ProductionPlanRow
} from "../../infrastructure/db/schema";

import { ProductionPlanImportBatchDetailResponseDto } from "./dto/production-plan-import-batch-detail-response.dto";
import { ProductionPlanImportBatchResponseDto } from "./dto/production-plan-import-batch-response.dto";
import { ProductionPlanImportRowResponseDto } from "./dto/production-plan-import-row-response.dto";
import type { UpdateProductionPlanRowRequestDto } from "./dto/update-production-plan-row-request.dto";
import {
  MAX_IMPORT_FILE_SIZE_BYTES,
  ProductionPlanImportParser,
  type ProductionPlanRowCandidate
} from "./production-plan-import.parser";
import { ProductionPlanImportsRepository } from "./production-plan-imports.repository";

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

  async createImport(
    file: UploadedProductionPlanImportFile | undefined
  ): Promise<ProductionPlanImportBatchResponseDto> {
    const normalizedFile = this.validateAndNormalizeUpload(file);
    const parsedImport = this.productionPlanImportParser.parseWorkbook(
      normalizedFile.originalname,
      normalizedFile.buffer
    );

    const createdBatch =
      await this.productionPlanImportsRepository.createImportBatch({
        fileName: normalizedFile.originalname,
        sheetName: parsedImport.sheetName,
        status: parsedImport.status,
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
          quantity: row.quantity,
          orderUnit: row.orderUnit,
          plannedFinishDate: row.plannedFinishDate,
          departmentCode: row.departmentCode,
          priority: row.priority,
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

    const updatedRowResult =
      await this.productionPlanImportsRepository.updateRowAndRefreshBatchSummary(id, {
        weekRaw: normalizedRow.weekRaw,
        weekNumber: normalizedRow.weekNumber,
        customerName: normalizedRow.customerName,
        orderingPartyCode: normalizedRow.orderingPartyCode,
        customerOrderNumber: normalizedRow.customerOrderNumber,
        customerOrderItemNumber: normalizedRow.customerOrderItemNumber,
        workOrderNumber: normalizedRow.workOrderNumber,
        materialCode: normalizedRow.materialCode,
        materialName: normalizedRow.materialName,
        quantity: normalizedRow.quantity,
        orderUnit: normalizedRow.orderUnit,
        plannedFinishDate: normalizedRow.plannedFinishDate,
        departmentCode: normalizedRow.departmentCode,
        priority: normalizedRow.priority,
        isValid: normalizedRow.isValid,
        validationErrors: normalizedRow.validationErrors
      });

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
      weekRaw: request.weekRaw !== undefined ? request.weekRaw : existingRow.weekRaw,
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
      status: batch.status,
      totalRowCount: batch.totalRowCount,
      validRowCount: batch.validRowCount,
      invalidRowCount: batch.invalidRowCount,
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
      quantity: row.quantity,
      orderUnit: row.orderUnit,
      plannedFinishDate: row.plannedFinishDate,
      departmentCode: row.departmentCode,
      priority: row.priority,
      isValid: row.isValid,
      validationErrors: row.validationErrors,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
