import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import { CreateOptimizationDryRunRequestDto } from "./dto/create-optimization-dry-run-request.dto";
import { OptimizationDryRunResponseDto } from "./dto/optimization-dry-run-response.dto";
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
    @Body() request: CreateOptimizationDryRunRequestDto
  ): Promise<OptimizationDryRunResponseDto> {
    return this.optimizationRequestsService.createDryRun(request);
  }
}
