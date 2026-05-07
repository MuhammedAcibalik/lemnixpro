import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post
} from "@nestjs/common";
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import type {
  OptimizationResultDetailResponse,
  OptimizationResultPayload,
  OptimizationResultRecord
} from "@lemnixpro/shared-contracts";

import { ResultsService } from "./results.service";

type WriteResultPayloadRequest = {
  jobId: string;
  resultId: string;
  completedAt: string;
  payload: OptimizationResultPayload;
};

@ApiTags("results")
@Controller("results")
export class ResultsController {
  constructor(
    @Inject(ResultsService)
    private readonly resultsService: ResultsService
  ) {}

  @Get()
  @ApiOperation({ summary: "Optimizasyon sonuç kayıtlarını döndürür." })
  @ApiOkResponse({ description: "Optimizasyon sonuç listesi döndürüldü." })
  async findAll(): Promise<OptimizationResultRecord[]> {
    return this.resultsService.findAll();
  }

  @Get("by-job/:jobId")
  @ApiOperation({
    summary:
      "İş kimliğine göre zengin optimizasyon sonucu (payload + metrics) döndürür."
  })
  @ApiOkResponse()
  async findByJob(
    @Param("jobId", new ParseUUIDPipe({ version: "4" })) jobId: string
  ): Promise<OptimizationResultDetailResponse> {
    return this.resultsService.findDetailByJobId(jobId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Optimizasyon sonuç kaydını döndürür." })
  @ApiOkResponse({ description: "Optimizasyon sonucu döndürüldü." })
  @ApiNotFoundResponse({ description: "Optimizasyon sonucu bulunamadı." })
  async findById(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<OptimizationResultRecord> {
    return this.resultsService.findById(id);
  }
}

@ApiTags("results-internal")
@Controller("internal/results")
export class InternalResultsController {
  constructor(
    @Inject(ResultsService)
    private readonly resultsService: ResultsService
  ) {}

  @Post("payload")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Engine'in büyük (queue dışı) optimizasyon payload'unu kalıcı kaydetmesi için kullanılan iç endpoint."
  })
  @ApiOkResponse()
  async writePayload(
    @Body() body: WriteResultPayloadRequest
  ): Promise<{ id: string; resultId: string }> {
    return this.resultsService.upsertPayload({
      jobId: body.jobId,
      resultId: body.resultId,
      completedAt: body.completedAt,
      payload: body.payload
    });
  }
}
