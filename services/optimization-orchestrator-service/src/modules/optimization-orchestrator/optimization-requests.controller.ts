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
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse
} from "@nestjs/swagger";

import { CreateOptimizationRequestDto } from "./dto/create-optimization-request.dto";
import { OptimizationDryRunResponseDto } from "./dto/optimization-dry-run-response.dto";
import {
  CreateOptimizationRequestResponseDto,
  OptimizationRequestDetailResponseDto,
  OptimizationRequestPreparationFailedResponseDto,
  OptimizationRequestRequeueRejectedResponseDto,
  OptimizationRequestRequeueResponseDto,
  OptimizationRequestSummaryDto
} from "./dto/optimization-request-response.dto";
import { OptimizationRequestsService } from "./optimization-requests.service";

@ApiTags("optimization-requests")
@Controller("optimization-requests")
export class OptimizationRequestsController {
  constructor(
    @Inject(OptimizationRequestsService)
    private readonly optimizationRequestsService: OptimizationRequestsService
  ) {}

  @Post("dry-run")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Prepare a read-only optimization request preview from the active production plan batch and main profile master data."
  })
  @ApiOkResponse({ type: OptimizationDryRunResponseDto })
  @ApiBadRequestResponse({
    description: "weekNumber must be a positive integer."
  })
  @ApiNotFoundResponse({
    description: "No active production plan batch exists for the requested week."
  })
  async createDryRun(
    @Body() request: CreateOptimizationRequestDto
  ): Promise<OptimizationDryRunResponseDto> {
    return this.optimizationRequestsService.createDryRun(request);
  }

  @Post()
  @ApiOperation({
    summary:
      "Create and persist an optimization request from the active production plan batch for the selected week."
  })
  @ApiCreatedResponse({ type: CreateOptimizationRequestResponseDto })
  @ApiBadRequestResponse({
    description: "weekNumber must be a positive integer."
  })
  @ApiNotFoundResponse({
    description: "No active production plan batch exists for the requested week."
  })
  @ApiUnprocessableEntityResponse({
    type: OptimizationRequestPreparationFailedResponseDto
  })
  async createRequest(
    @Body() request: CreateOptimizationRequestDto
  ): Promise<CreateOptimizationRequestResponseDto> {
    return this.optimizationRequestsService.createRequest(request);
  }

  @Get("ready")
  @ApiOperation({
    summary:
      'List optimization requests that remain in "ready" state and are eligible for manual requeue.'
  })
  @ApiOkResponse({
    type: OptimizationRequestSummaryDto,
    isArray: true
  })
  async findReady(): Promise<OptimizationRequestSummaryDto[]> {
    return this.optimizationRequestsService.findReady();
  }

  @Get()
  @ApiOperation({
    summary: "List persisted optimization requests ordered newest first."
  })
  @ApiOkResponse({
    type: OptimizationRequestSummaryDto,
    isArray: true
  })
  async findAll(): Promise<OptimizationRequestSummaryDto[]> {
    return this.optimizationRequestsService.findAll();
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get a persisted optimization request by id."
  })
  @ApiParam({
    name: "id"
  })
  @ApiOkResponse({
    type: OptimizationRequestDetailResponseDto
  })
  @ApiNotFoundResponse({
    description: "Optimization request was not found."
  })
  async findById(
    @Param("id") id: string
  ): Promise<OptimizationRequestDetailResponseDto> {
    return this.optimizationRequestsService.findById(id);
  }

  @Post(":id/requeue")
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Manually re-publish an optimization request that is still in "ready" state.'
  })
  @ApiParam({
    name: "id"
  })
  @ApiOkResponse({
    type: OptimizationRequestRequeueResponseDto
  })
  @ApiNotFoundResponse({
    description: "Optimization request was not found."
  })
  @ApiUnprocessableEntityResponse({
    type: OptimizationRequestRequeueRejectedResponseDto
  })
  async requeueRequest(
    @Param("id") id: string
  ): Promise<OptimizationRequestRequeueResponseDto> {
    return this.optimizationRequestsService.requeueRequest(id);
  }
}
