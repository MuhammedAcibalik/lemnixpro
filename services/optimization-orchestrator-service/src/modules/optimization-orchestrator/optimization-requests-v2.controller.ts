import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse
} from "@nestjs/swagger";

import type {
  OptimizationRequestDiagnosticsResponse,
  OptimizationRequestSummaryV2,
  OptimizationResultDetailResponse
} from "@lemnixpro/shared-contracts";

import { ResultServiceClient } from "../../infrastructure/http/result-service.client";

import {
  CreateOptimizationRequestFromSnapshotDto,
  CreateOptimizationRequestFromSnapshotResponseDto,
  OptimizationDryRunV2ResponseDto
} from "./dto";
import { OptimizationRequestsV2Service } from "./optimization-requests-v2.service";

@ApiTags("optimization-requests-v2")
@Controller("optimization-requests/v2")
export class OptimizationRequestsV2Controller {
  constructor(
    @Inject(OptimizationRequestsV2Service)
    private readonly optimizationRequestsV2Service: OptimizationRequestsV2Service,
    @Inject(ResultServiceClient)
    private readonly resultServiceClient: ResultServiceClient
  ) {}

  @Post("from-snapshot/dry-run")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Build a read-only optimization preview from the cut-list snapshot using the requested overrides and config."
  })
  @ApiOkResponse({
    description:
      "Preview of the OR-Tools payload, including normalised demand items and profile groups."
  })
  @ApiUnprocessableEntityResponse({
    description:
      "No work orders selected, no demand items remain after filtering, or stock bars are too short for the safety trim."
  })
  async createDryRun(
    @Body() input: CreateOptimizationRequestFromSnapshotDto
  ): Promise<OptimizationDryRunV2ResponseDto> {
    return this.optimizationRequestsV2Service.createDryRun(input);
  }

  @Post("from-snapshot")
  @ApiOperation({
    summary:
      "Persist and queue an OR-Tools optimization request from the cut-list snapshot."
  })
  @ApiCreatedResponse({
    description:
      "Optimization request was persisted and dispatched to the optimization engine."
  })
  @ApiUnprocessableEntityResponse({
    description: "Selection or override constraints make the request infeasible."
  })
  async createRequest(
    @Body() input: CreateOptimizationRequestFromSnapshotDto
  ): Promise<CreateOptimizationRequestFromSnapshotResponseDto> {
    return this.optimizationRequestsV2Service.createRequest(input);
  }

  @Get("by-snapshot/:cutListSnapshotId")
  @ApiOperation({
    summary:
      "List optimization requests created from a specific cut-list snapshot, newest first."
  })
  @ApiParam({ name: "cutListSnapshotId" })
  @ApiOkResponse({ isArray: true })
  async findBySnapshot(
    @Param("cutListSnapshotId") cutListSnapshotId: string
  ): Promise<OptimizationRequestSummaryV2[]> {
    return this.optimizationRequestsV2Service.findByCutListSnapshotId(
      cutListSnapshotId
    );
  }

  @Get(":id/status")
  @ApiOperation({
    summary:
      "Return the current lifecycle status for a V2 optimization request."
  })
  @ApiParam({ name: "id" })
  @ApiOkResponse()
  @ApiNotFoundResponse({ description: "Optimization request was not found." })
  async findStatus(
    @Param("id") id: string
  ): Promise<OptimizationRequestSummaryV2> {
    return this.optimizationRequestsV2Service.findLifecycleStatus(id);
  }

  @Get(":id/diagnostics")
  @ApiOperation({
    summary:
      "Return canonical request/result diagnostics for an optimization request."
  })
  @ApiParam({ name: "id" })
  @ApiOkResponse()
  @ApiNotFoundResponse({ description: "Optimization request was not found." })
  async findDiagnostics(
    @Param("id") id: string
  ): Promise<OptimizationRequestDiagnosticsResponse> {
    return this.optimizationRequestsV2Service.findDiagnostics(id);
  }

  @Get(":id/result")
  @ApiOperation({
    summary:
      "Fetch the rich optimization result for a request once the engine has completed."
  })
  @ApiParam({ name: "id" })
  @ApiOkResponse()
  async findResult(
    @Param("id") id: string
  ): Promise<OptimizationResultDetailResponse> {
    return this.resultServiceClient.getResultByJobId(id);
  }
}
