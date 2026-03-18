import { Inject, Injectable } from "@nestjs/common";

import {
  MainProfileResponse,
  MasterDataClient
} from "../../infrastructure/http/master-data.client";
import {
  ProductionPlanActiveBatchRow,
  ProductionPlanClient,
  ProductionPlanImportBatchSummary
} from "../../infrastructure/http/production-plan.client";

import type { CreateOptimizationDryRunRequestDto } from "./dto/create-optimization-dry-run-request.dto";
import type {
  OptimizationDryRunResponseDto,
  OptimizationDryRunUnmatchedReasonCode,
  OptimizationDryRunUnmatchedRowDto,
  OptimizationRequestPreviewDemandRowDto,
  OptimizationRequestPreviewMainProfileDto
} from "./dto/optimization-dry-run-response.dto";

type RowEvaluationResult =
  | {
      matchedProfile: MainProfileResponse;
      unmatchedRow: null;
    }
  | {
      matchedProfile: null;
      unmatchedRow: OptimizationDryRunUnmatchedRowDto;
    };

@Injectable()
export class OptimizationRequestsService {
  constructor(
    @Inject(ProductionPlanClient)
    private readonly productionPlanClient: ProductionPlanClient,
    @Inject(MasterDataClient)
    private readonly masterDataClient: MasterDataClient
  ) {}

  async createDryRun(
    request: CreateOptimizationDryRunRequestDto
  ): Promise<OptimizationDryRunResponseDto> {
    const [activeBatchRows, mainProfiles] = await Promise.all([
      this.productionPlanClient.getActiveBatchRowsByWeekNumber(request.weekNumber),
      this.masterDataClient.getMainProfiles()
    ]);

    const activeMainProfiles = mainProfiles.filter((profile) => profile.isActive);
    const mainProfilesByLinkedProductCode =
      this.groupMainProfilesByLinkedProductCode(activeMainProfiles);
    const unmatchedRows: OptimizationDryRunUnmatchedRowDto[] = [];
    const previewDemandRows: OptimizationRequestPreviewDemandRowDto[] = [];
    const previewMainProfilesById = new Map<
      string,
      OptimizationRequestPreviewMainProfileDto
    >();

    for (const row of activeBatchRows.rows) {
      const evaluation = this.evaluateRow(
        row,
        mainProfilesByLinkedProductCode
      );

      if (!evaluation.matchedProfile) {
        unmatchedRows.push(evaluation.unmatchedRow);
        continue;
      }

      previewDemandRows.push(
        this.toPreviewDemandRow(row, evaluation.matchedProfile)
      );
      previewMainProfilesById.set(
        evaluation.matchedProfile.id,
        this.toPreviewMainProfile(evaluation.matchedProfile)
      );
    }

    const previewMainProfiles = [...previewMainProfilesById.values()].sort((left, right) =>
      left.code.localeCompare(right.code)
    );

    return {
      weekNumber: request.weekNumber,
      activeBatch: this.toActiveBatchSummary(activeBatchRows.batch),
      totalProductionRows: activeBatchRows.rows.length,
      masterDataCountUsed: previewMainProfiles.length,
      matchedRows: previewDemandRows.length,
      unmatchedRows: unmatchedRows.length,
      rowsMissingMasterDataLinkage: unmatchedRows.filter((row) =>
        row.reasons.some((reason) => this.isMasterDataLinkageReason(reason))
      ).length,
      unmatchedReasons: unmatchedRows,
      optimizationRequestPreview: {
        weekNumber: request.weekNumber,
        activeBatchId: activeBatchRows.batch.id,
        mainProfiles: previewMainProfiles,
        demandRows: previewDemandRows
      }
    };
  }

  private groupMainProfilesByLinkedProductCode(
    profiles: MainProfileResponse[]
  ): Map<string, MainProfileResponse[]> {
    const profilesByLinkedProductCode = new Map<string, MainProfileResponse[]>();

    for (const profile of profiles) {
      const linkedProductCode = this.normalizeCode(profile.linkedProductCode);

      if (!linkedProductCode) {
        continue;
      }

      const existingProfiles =
        profilesByLinkedProductCode.get(linkedProductCode) ?? [];

      existingProfiles.push(profile);
      profilesByLinkedProductCode.set(linkedProductCode, existingProfiles);
    }

    return profilesByLinkedProductCode;
  }

  private evaluateRow(
    row: ProductionPlanActiveBatchRow,
    mainProfilesByLinkedProductCode: Map<string, MainProfileResponse[]>
  ): RowEvaluationResult {
    const reasons: OptimizationDryRunUnmatchedReasonCode[] = [];
    const details: string[] = [];
    const normalizedMaterialCode = this.normalizeCode(row.materialCode);

    if (!row.isValid) {
      reasons.push("production_row_invalid");
      details.push(
        ...(
          row.validationErrors.length > 0
            ? row.validationErrors
            : ["The production row is not valid in production-plan-service."]
        )
      );
    }

    if (!normalizedMaterialCode) {
      reasons.push("missing_material_code");
      details.push(
        "materialCode is required to match the production row to main profile master data."
      );
    }

    const matchingProfiles =
      normalizedMaterialCode === null
        ? []
        : (mainProfilesByLinkedProductCode.get(normalizedMaterialCode) ?? []);

    if (normalizedMaterialCode && matchingProfiles.length === 0) {
      reasons.push("missing_active_main_profile");
      details.push(
        `No active main profile was found for materialCode "${row.materialCode}".`
      );
    }

    if (normalizedMaterialCode && matchingProfiles.length > 1) {
      reasons.push("ambiguous_active_main_profile");
      details.push(
        `Multiple active main profiles share linkedProductCode "${normalizedMaterialCode}": ${matchingProfiles.map((profile) => profile.code).join(", ")}.`
      );
    }

    if (reasons.length > 0) {
      return {
        matchedProfile: null,
        unmatchedRow: {
          rowId: row.id,
          rowIndex: row.rowIndex,
          materialCode: row.materialCode,
          workOrderNumber: row.workOrderNumber,
          reasons,
          details: this.uniqueStrings(details)
        }
      };
    }

    const [matchedProfile] = matchingProfiles;

    if (!matchedProfile) {
      throw new Error(
        `Expected a unique main profile match for production row "${row.id}".`
      );
    }

    return {
      matchedProfile,
      unmatchedRow: null
    };
  }

  private toActiveBatchSummary(
    batch: ProductionPlanImportBatchSummary
  ): OptimizationDryRunResponseDto["activeBatch"] {
    if (batch.weekNumber === null) {
      throw new Error(
        `Active production batch "${batch.id}" does not have an authoritative week number.`
      );
    }

    if (batch.status !== "active") {
      throw new Error(
        `Expected an active production batch for dry run preparation, received "${batch.status}".`
      );
    }

    return {
      id: batch.id,
      fileName: batch.fileName,
      sheetName: batch.sheetName,
      weekNumber: batch.weekNumber,
      status: batch.status,
      totalRowCount: batch.totalRowCount,
      validRowCount: batch.validRowCount,
      invalidRowCount: batch.invalidRowCount,
      activatedAt: batch.activatedAt,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt
    };
  }

  private toPreviewMainProfile(
    profile: MainProfileResponse
  ): OptimizationRequestPreviewMainProfileDto {
    return {
      id: profile.id,
      code: profile.code,
      name: profile.name,
      linkedProductCode: profile.linkedProductCode,
      linkedProductName: profile.linkedProductName,
      stockLengthMm: profile.stockLengthMm
    };
  }

  private toPreviewDemandRow(
    row: ProductionPlanActiveBatchRow,
    profile: MainProfileResponse
  ): OptimizationRequestPreviewDemandRowDto {
    if (!row.materialCode) {
      throw new Error(
        `Expected materialCode for matched production row "${row.id}".`
      );
    }

    if (row.quantity === null) {
      throw new Error(`Expected quantity for matched production row "${row.id}".`);
    }

    if (!row.orderUnit) {
      throw new Error(`Expected orderUnit for matched production row "${row.id}".`);
    }

    return {
      productionRowId: row.id,
      rowIndex: row.rowIndex,
      mainProfileId: profile.id,
      mainProfileCode: profile.code,
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
      priority: row.priority
    };
  }

  private normalizeCode(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalizedValue = value.trim().toUpperCase();

    return normalizedValue === "" ? null : normalizedValue;
  }

  private uniqueStrings(values: string[]): string[] {
    return [...new Set(values)];
  }

  private isMasterDataLinkageReason(
    reason: OptimizationDryRunUnmatchedReasonCode
  ): boolean {
    return reason !== "production_row_invalid";
  }
}
