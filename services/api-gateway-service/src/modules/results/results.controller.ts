import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import type { OptimizationResultRecord } from "@lemnixpro/shared-contracts";

import { ResultsClient } from "../../infrastructure/http/results.client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("results")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("results")
export class ResultsController {
  constructor(
    @Inject(ResultsClient)
    private readonly resultsClient: ResultsClient
  ) {}

  @Get()
  @ApiOperation({ summary: "Proxy list for optimization results." })
  @ApiOkResponse({ description: "Optimization results returned." })
  async findAll(): Promise<OptimizationResultRecord[]> {
    return this.resultsClient.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Proxy read for one optimization result." })
  @ApiOkResponse({ description: "Optimization result returned." })
  @ApiNotFoundResponse({ description: "Optimization result was not found." })
  async findById(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<OptimizationResultRecord> {
    return this.resultsClient.findById(id);
  }
}
