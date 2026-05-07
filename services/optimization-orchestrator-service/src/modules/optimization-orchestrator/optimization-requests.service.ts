import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from "@nestjs/common";

import type { OptimizationQueueEnvelope } from "@lemnixpro/shared-contracts";
import { createMessageMetadata } from "@lemnixpro/shared-utils";

import {
  MainProfileResponse,
  MasterDataClient
} from "../../infrastructure/http/master-data.client";
import {
  ProductionPlanActiveBatchRow,
  ProductionPlanClient,
  ProductionPlanImportBatchSummary
} from "../../infrastructure/http/production-plan.client";
import type {
  OptimizationRequestListRecord,
  OptimizationRequestRecord
} from "../../infrastructure/db/schema";

import type {
  CreateOptimizationRequestDto,
  CreateOptimizationRequestResponseDto,
  OptimizationDemandRowDto,
  OptimizationDryRunResponseDto,
  OptimizationMainProfileInputDto,
  OptimizationPreparationUnmatchedReasonCode,
  OptimizationPreparationUnmatchedRowDto,
  OptimizationRequestDetailResponseDto,
  OptimizationRequestPayloadDto,
  OptimizationRequestRequeueResponseDto,
  OptimizationRequestSummaryDto,
  OptimizationUnmatchedSummaryDto
} from "./dto";
import {
  OPTIMIZATION_REQUEST_QUEUE_PUBLISHER,
  type OptimizationRequestQueuePublisher
} from "./optimization-request-queue.publisher";
import { OptimizationRequestsRepository } from "./optimization-requests.repository";

type RowEvaluationResult =
  | {
      matchedProfile: MainProfileResponse;
      unmatchedRow: null;
    }
  | {
      matchedProfile: null;
      unmatchedRow: OptimizationPreparationUnmatchedRowDto;
    };

type PreparedOptimizationRequest = {
  weekNumber: number;
  activeBatch: OptimizationDryRunResponseDto["activeBatch"];
  totalProductionRows: number;
  matchedRows: number;
  unmatchedRows: number;
  rowsMissingMasterDataLinkage: number;
  unmatchedReasons: OptimizationPreparationUnmatchedRowDto[];
  payloadPreview: OptimizationRequestPayloadDto;
};

@Injectable()
export class OptimizationRequestsService {
  constructor(
    @Inject(ProductionPlanClient)
    private readonly productionPlanClient: ProductionPlanClient,
    @Inject(MasterDataClient)
    private readonly masterDataClient: MasterDataClient,
    @Inject(OPTIMIZATION_REQUEST_QUEUE_PUBLISHER)
    private readonly optimizationRequestQueuePublisher: OptimizationRequestQueuePublisher,
    @Inject(OptimizationRequestsRepository)
    private readonly optimizationRequestsRepository: OptimizationRequestsRepository
  ) {}

  async createDryRun(
    request: CreateOptimizationRequestDto
  ): Promise<OptimizationDryRunResponseDto> {
    const preparedRequest = await this.prepareOptimizationRequest(request);

    return {
      weekNumber: preparedRequest.weekNumber,
      activeBatch: preparedRequest.activeBatch,
      totalProductionRows: preparedRequest.totalProductionRows,
      masterDataCountUsed: preparedRequest.payloadPreview.mainProfiles.length,
      matchedRows: preparedRequest.matchedRows,
      unmatchedRows: preparedRequest.unmatchedRows,
      rowsMissingMasterDataLinkage:
        preparedRequest.rowsMissingMasterDataLinkage,
      unmatchedReasons: preparedRequest.unmatchedReasons,
      optimizationRequestPreview: preparedRequest.payloadPreview
    };
  }

  async createRequest(
    request: CreateOptimizationRequestDto
  ): Promise<CreateOptimizationRequestResponseDto> {
    const preparedRequest = await this.prepareOptimizationRequest(request);
    const createdRequest = await this.optimizationRequestsRepository.create({
      weekNumber: preparedRequest.weekNumber,
      sourceBatchId: preparedRequest.payloadPreview.sourceBatchId,
      payloadJson: preparedRequest.payloadPreview,
      matchedRows: preparedRequest.matchedRows,
      unmatchedRows: preparedRequest.unmatchedRows
    });

    if (!this.hasUsableDemandRows(preparedRequest)) {
      const failedRequest = await this.optimizationRequestsRepository.updateStatus({
        id: createdRequest.id,
        status: "failed_preparation"
      });
      const response = this.toCreateRequestResponse(
        failedRequest,
        preparedRequest
      );

      throw new UnprocessableEntityException({
        message: `Optimization request for week "${request.weekNumber}" could not be prepared because no optimization-ready rows were available.`,
        ...response
      });
    }

    const readyRequest = await this.optimizationRequestsRepository.updateStatus({
      id: createdRequest.id,
      status: "ready"
    });
    const queuedRequest = await this.handoffReadyRequest(readyRequest);

    return this.toCreateRequestResponse(queuedRequest, preparedRequest);
  }

  async findAll(): Promise<OptimizationRequestSummaryDto[]> {
    const requests = await this.optimizationRequestsRepository.findAll();

    return requests.map((request) => this.toRequestSummary(request));
  }

  async findReady(): Promise<OptimizationRequestSummaryDto[]> {
    const requests = await this.optimizationRequestsRepository.findReady();

    return requests.map((request) => this.toRequestSummary(request));
  }

  async findById(id: string): Promise<OptimizationRequestDetailResponseDto> {
    const request = await this.optimizationRequestsRepository.findById(id);

    if (!request) {
      throw new NotFoundException(`Optimization request "${id}" was not found.`);
    }

    return {
      request: this.toRequestSummary(request),
      payloadPreview: request.payloadJson as OptimizationRequestPayloadDto
    };
  }

  async requeueRequest(
    id: string
  ): Promise<OptimizationRequestRequeueResponseDto> {
    const request = await this.optimizationRequestsRepository.findById(id);

    if (!request) {
      throw new NotFoundException(`Optimization request "${id}" was not found.`);
    }

    if (request.status !== "ready") {
      throw new UnprocessableEntityException({
        message: `Optimization request "${id}" can be requeued only from "ready" status. Current status is "${request.status}".`,
        request: this.toRequestSummary(request)
      });
    }

    const queuedRequest = await this.handoffReadyRequest(request);

    return {
      request: this.toRequestSummary(queuedRequest),
      message: `Optimization request "${id}" was requeued to the optimization request queue.`
    };
  }

  private async prepareOptimizationRequest(
    request: CreateOptimizationRequestDto
  ): Promise<PreparedOptimizationRequest> {
    const [activeBatchRows, mainProfiles] = await Promise.all([
      this.productionPlanClient.getActiveBatchRowsByWeekNumber(request.weekNumber),
      this.masterDataClient.getMainProfiles()
    ]);
    const activeMainProfiles = mainProfiles.filter((profile) => profile.isActive);
    const mainProfilesByLinkedProductCode =
      this.groupMainProfilesByLinkedProductCode(activeMainProfiles);
    const unmatchedRows: OptimizationPreparationUnmatchedRowDto[] = [];
    const demandRows: OptimizationDemandRowDto[] = [];
    const mainProfilesById = new Map<string, OptimizationMainProfileInputDto>();

    for (const row of activeBatchRows.rows) {
      const evaluation = this.evaluateRow(
        row,
        mainProfilesByLinkedProductCode
      );

      if (!evaluation.matchedProfile) {
        unmatchedRows.push(evaluation.unmatchedRow);
        continue;
      }

      demandRows.push(this.toDemandRow(row, evaluation.matchedProfile));
      mainProfilesById.set(
        evaluation.matchedProfile.id,
        this.toMainProfileInput(evaluation.matchedProfile)
      );
    }

    const mainProfileInputs = [...mainProfilesById.values()].sort((left, right) =>
      left.code.localeCompare(right.code)
    );

    return {
      weekNumber: request.weekNumber,
      activeBatch: this.toActiveBatchSummary(activeBatchRows.batch),
      totalProductionRows: activeBatchRows.rows.length,
      matchedRows: demandRows.length,
      unmatchedRows: unmatchedRows.length,
      rowsMissingMasterDataLinkage: unmatchedRows.filter((row) =>
        row.reasons.some((reason) => this.isMasterDataLinkageReason(reason))
      ).length,
      unmatchedReasons: unmatchedRows,
      payloadPreview: {
        weekNumber: request.weekNumber,
        sourceBatchId: activeBatchRows.batch.id,
        mainProfiles: mainProfileInputs,
        demandRows
      }
    };
  }

  private hasUsableDemandRows(
    preparedRequest: PreparedOptimizationRequest
  ): boolean {
    return preparedRequest.matchedRows > 0;
  }

  private toCreateRequestResponse(
    persistedRequest: OptimizationRequestRecord,
    preparedRequest: PreparedOptimizationRequest
  ): CreateOptimizationRequestResponseDto {
    return {
      request: this.toRequestSummary(persistedRequest),
      payloadPreview: preparedRequest.payloadPreview,
      unmatchedSummary: this.toUnmatchedSummary(preparedRequest)
    };
  }

  private async handoffReadyRequest(
    request: OptimizationRequestRecord
  ): Promise<OptimizationRequestRecord> {
    const queuedAt = new Date().toISOString();

    await this.optimizationRequestQueuePublisher.publish(
      this.toQueueEnvelope(request, queuedAt)
    );

    return this.optimizationRequestsRepository.markQueuedFromReady({
      id: request.id,
      queuedAt
    });
  }

  private toRequestSummary(
    request: OptimizationRequestListRecord
  ): OptimizationRequestSummaryDto {
    return {
      id: request.id,
      weekNumber: request.weekNumber,
      sourceBatchId: request.sourceBatchId,
      status: request.status as OptimizationRequestSummaryDto["status"],
      matchedRows: request.matchedRows,
      unmatchedRows: request.unmatchedRows,
      queuedAt: request.queuedAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt
    };
  }

  private toQueueEnvelope(
    request: OptimizationRequestRecord,
    queuedAt: string
  ): OptimizationQueueEnvelope {
    return {
      metadata: createMessageMetadata({
        causationId: request.id,
        occurredAt: queuedAt
      }),
      requestId: request.id,
      weekNumber: request.weekNumber,
      sourceBatchId: request.sourceBatchId,
      payload: request.payloadJson as OptimizationRequestPayloadDto,
      queuedAt
    };
  }

  private toUnmatchedSummary(
    preparedRequest: PreparedOptimizationRequest
  ): OptimizationUnmatchedSummaryDto {
    return {
      totalUnmatchedRows: preparedRequest.unmatchedRows,
      rowsMissingMasterDataLinkage:
        preparedRequest.rowsMissingMasterDataLinkage,
      unmatchedReasons: preparedRequest.unmatchedReasons
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
    const reasons: OptimizationPreparationUnmatchedReasonCode[] = [];
    const details: string[] = [];
    const normalizedMaterialCode = this.normalizeCode(row.materialCode);

    let matchingProfiles =
      normalizedMaterialCode === null
        ? []
        : (mainProfilesByLinkedProductCode.get(normalizedMaterialCode) ?? []);

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

    if (normalizedMaterialCode && matchingProfiles.length === 0) {
      reasons.push("missing_active_main_profile");
      details.push(
        `No active main profile was found for materialCode "${row.materialCode}".`
      );
    }

    if (normalizedMaterialCode && matchingProfiles.length > 1) {
      const profileHint = this.normalizeCode(row.mainProfileCode);

      if (profileHint) {
        const narrowedProfiles = matchingProfiles.filter(
          (profile) => this.normalizeCode(profile.code) === profileHint
        );

        if (narrowedProfiles.length === 1) {
          matchingProfiles = narrowedProfiles;
        } else if (narrowedProfiles.length === 0) {
          reasons.push("main_profile_code_unmatched");
          details.push(
            `Üretim planı satırındaki profil kodu "${row.mainProfileCode}" bu ana ürün (${normalizedMaterialCode}) için tanımlı aktif ana profillerle eşleşmiyor: ${matchingProfiles.map((p) => p.code).join(", ")}.`
          );
        } else {
          reasons.push("ambiguous_active_main_profile");
          details.push(
            `Bu ana ürün ("${normalizedMaterialCode}") ve profil kodu ("${row.mainProfileCode}") için birden fazla eşleşme var (${narrowedProfiles.map((p) => p.code).join(", ")}).`
          );
        }
      } else {
        reasons.push("ambiguous_active_main_profile");
        details.push(
          `Bu ana ürün ("${normalizedMaterialCode}") için birden fazla aktif ana profil tanımlı (${matchingProfiles.map((profile) => profile.code).join(", ")}). Üretim planı satırına hangi profilin kullanılacağını seçmek için "profil kodu" alanını doldurun.`
        );
      }
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
        `Expected an active production batch for optimization preparation, received "${batch.status}".`
      );
    }

    return {
      id: batch.id,
      fileName: batch.fileName,
      sheetName: batch.sheetName,
      planYear: (batch as { planYear?: number | null }).planYear ?? null,
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

  private toMainProfileInput(
    profile: MainProfileResponse
  ): OptimizationMainProfileInputDto {
    return {
      id: profile.id,
      code: profile.code,
      name: profile.name,
      linkedProductCode: profile.linkedProductCode,
      linkedProductName: profile.linkedProductName,
      stockLengthMm: profile.stockLengthMm
    };
  }

  private toDemandRow(
    row: ProductionPlanActiveBatchRow,
    profile: MainProfileResponse
  ): OptimizationDemandRowDto {
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
    reason: OptimizationPreparationUnmatchedReasonCode
  ): boolean {
    return reason !== "production_row_invalid";
  }
}
