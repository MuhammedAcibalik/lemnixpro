import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import type {
  CreateOptimizationRequestFromSnapshotResponse,
  CreateOptimizationRequestResponse,
  OptimizationDryRunResponse,
  OptimizationDryRunResponseV2,
  OptimizationRequestDiagnosticsResponse,
  OptimizationRequestDetailResponse,
  OptimizationRequestRequeueResponse,
  OptimizationRequestSummary,
  OptimizationRequestSummaryV2,
  OptimizationResultDetailResponse
} from "@lemnixpro/shared-contracts";

import { OptimizationRequestsClient } from "../../infrastructure/http/optimization-requests.client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

import { CreateOptimizationRequestFromSnapshotDto } from "./dto/create-optimization-request-from-snapshot.dto";
import { CreateOptimizationRequestDto } from "./dto/create-optimization-request.dto";

@ApiTags("optimization-requests")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("optimization-requests")
export class OptimizationRequestsController {
  constructor(
    @Inject(OptimizationRequestsClient)
    private readonly optimizationRequestsClient: OptimizationRequestsClient
  ) {}

  @Post("dry-run")
  @HttpCode(200)
  @ApiOperation({ summary: "Proxy dry-run preparation for an optimization request." })
  @ApiOkResponse({ description: "Optimization dry-run returned." })
  async createDryRun(
    @Body() request: CreateOptimizationRequestDto
  ): Promise<OptimizationDryRunResponse> {
    return this.optimizationRequestsClient.createDryRun(request);
  }

  @Post()
  @ApiOperation({ summary: "Proxy create for an optimization request." })
  @ApiCreatedResponse({ description: "Optimization request created." })
  async createRequest(
    @Body() request: CreateOptimizationRequestDto
  ): Promise<CreateOptimizationRequestResponse> {
    return this.optimizationRequestsClient.createRequest(request);
  }

  @Get("ready")
  @ApiOperation({ summary: "Proxy list for optimization requests in ready state." })
  @ApiOkResponse({ description: "Ready optimization requests returned." })
  async findReady(): Promise<OptimizationRequestSummary[]> {
    return this.optimizationRequestsClient.findReady();
  }

  @Get()
  @ApiOperation({ summary: "Proxy list for persisted optimization requests." })
  @ApiOkResponse({ description: "Optimization requests returned." })
  async findAll(): Promise<OptimizationRequestSummary[]> {
    return this.optimizationRequestsClient.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Proxy read for one optimization request." })
  @ApiOkResponse({ description: "Optimization request returned." })
  async findById(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<OptimizationRequestDetailResponse> {
    return this.optimizationRequestsClient.findById(id);
  }

  @Post(":id/requeue")
  @HttpCode(200)
  @ApiOperation({ summary: "Proxy requeue for one optimization request." })
  @ApiOkResponse({ description: "Optimization request requeued." })
  async requeueRequest(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<OptimizationRequestRequeueResponse> {
    return this.optimizationRequestsClient.requeueRequest(id);
  }

  // ─────────────────────────────  Enterprise Optimization V2  ─────────────────────────────

  @Post("v2/from-snapshot/dry-run")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Snapshot tabanlı optimizasyon önizlemesi (kuyruk dışı). Override + iş emri filtreleri uygulanır."
  })
  @ApiOkResponse({ description: "Dry-run preview döndürüldü." })
  async createFromSnapshotDryRun(
    @Body() input: CreateOptimizationRequestFromSnapshotDto
  ): Promise<OptimizationDryRunResponseV2> {
    return this.optimizationRequestsClient.createFromSnapshotDryRun(input);
  }

  @Post("v2/from-snapshot")
  @ApiOperation({
    summary:
      "Snapshot tabanlı V2 optimizasyon talebini oluşturur ve OR-Tools kuyruğuna gönderir."
  })
  @ApiCreatedResponse({ description: "Optimizasyon talebi kuyruğa alındı." })
  async createFromSnapshot(
    @Body() input: CreateOptimizationRequestFromSnapshotDto
  ): Promise<CreateOptimizationRequestFromSnapshotResponse> {
    return this.optimizationRequestsClient.createFromSnapshot(input);
  }

  @Get("v2/by-snapshot/:cutListSnapshotId")
  @ApiOperation({
    summary:
      "Belirli bir kesim listesi snapshot'ından oluşturulmuş V2 optimizasyon taleplerini listeler."
  })
  @ApiOkResponse({ description: "V2 optimizasyon talepleri döndürüldü." })
  async findRequestsBySnapshot(
    @Param("cutListSnapshotId", new ParseUUIDPipe({ version: "4" }))
    cutListSnapshotId: string
  ): Promise<OptimizationRequestSummaryV2[]> {
    return this.optimizationRequestsClient.findRequestsBySnapshot(
      cutListSnapshotId
    );
  }

  @Get("v2/:id/status")
  @ApiOperation({
    summary: "V2 optimizasyon talebinin yaşam döngüsü durumunu döndürür."
  })
  @ApiOkResponse({ description: "Durum döndürüldü." })
  async findRequestStatusV2(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<OptimizationRequestSummaryV2> {
    return this.optimizationRequestsClient.findRequestStatusV2(id);
  }

  @Get("v2/:id/diagnostics")
  @ApiOperation({
    summary:
      "V2 optimizasyon talebi için canonical request/result diagnostic cevabını döndürür."
  })
  @ApiOkResponse({ description: "Diagnostic cevap döndürüldü." })
  async findDiagnosticsV2(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<OptimizationRequestDiagnosticsResponse> {
    return this.optimizationRequestsClient.findDiagnosticsV2(id);
  }

  @Get("v2/:id/result")
  @ApiOperation({
    summary:
      "V2 optimizasyon sonucunu (zengin payload + metrikler) iş kimliğine göre döndürür."
  })
  @ApiOkResponse({ description: "Sonuç döndürüldü." })
  async findResultByJobId(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<OptimizationResultDetailResponse> {
    return this.optimizationRequestsClient.findResultByJobId(id);
  }
}
