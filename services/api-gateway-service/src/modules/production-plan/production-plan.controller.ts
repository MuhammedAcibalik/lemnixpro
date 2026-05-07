import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import type {
  ProductionPlanActiveBatchRowsResponse,
  ProductionPlanImportBatch,
  ProductionPlanImportBatchDetail,
  ProductionPlanImportRow,
  ProductionPlanImportRowsPage
} from "@lemnixpro/shared-contracts";

import {
  type UploadedGatewayFile,
  ProductionPlanImportsClient
} from "../../infrastructure/http/production-plan-imports.client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

import { UpdateProductionPlanRowRequestDto } from "./dto/update-production-plan-row-request.dto";

@ApiTags("production-plan")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ProductionPlanController {
  constructor(
    @Inject(ProductionPlanImportsClient)
    private readonly productionPlanImportsClient: ProductionPlanImportsClient
  ) {}

  @Post("production-plan-imports")
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Proxy upload for a weekly production plan workbook." })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: {
          type: "string",
          format: "binary"
        }
      }
    }
  })
  @ApiCreatedResponse({ description: "Production plan import batch created." })
  async createImport(
    @UploadedFile() file?: UploadedGatewayFile
  ): Promise<ProductionPlanImportBatch> {
    return this.productionPlanImportsClient.createImport(file);
  }

  @Get("production-plan-imports")
  @ApiOperation({ summary: "Proxy list for production plan import batches." })
  @ApiOkResponse({ description: "Production plan import batches returned." })
  async findAllImports(): Promise<ProductionPlanImportBatch[]> {
    return this.productionPlanImportsClient.findAllImports();
  }

  @Get("production-plan-weeks/:weekNumber/batches")
  @ApiOperation({ summary: "Proxy list for production plan batches by week." })
  @ApiOkResponse({ description: "Production plan import batches returned." })
  async findImportsByWeekNumber(
    @Param("weekNumber", ParseIntPipe) weekNumber: number
  ): Promise<ProductionPlanImportBatch[]> {
    return this.productionPlanImportsClient.findImportsByWeekNumber(weekNumber);
  }

  @Get("production-plan-imports/:id")
  @ApiOperation({ summary: "Proxy read for one production plan import batch." })
  @ApiOkResponse({ description: "Production plan import batch returned." })
  async findImportById(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<ProductionPlanImportBatchDetail> {
    return this.productionPlanImportsClient.findImportById(id);
  }

  @Get("production-plan-imports/:id/rows/paged")
  @ApiOperation({
    summary: "Proxy paged list for normalized rows of one import batch."
  })
  @ApiOkResponse({ description: "Production plan row page returned." })
  async findRowsByBatchIdPaged(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query("limit") limitRaw?: string,
    @Query("offset") offsetRaw?: string
  ): Promise<ProductionPlanImportRowsPage> {
    const limitParsed =
      limitRaw !== undefined ? Number.parseInt(limitRaw, 10) : 100;
    const offsetParsed =
      offsetRaw !== undefined ? Number.parseInt(offsetRaw, 10) : 0;
    const limit = Number.isFinite(limitParsed) ? limitParsed : 100;
    const offset = Number.isFinite(offsetParsed) ? offsetParsed : 0;

    return this.productionPlanImportsClient.findRowsByBatchIdPaged(id, {
      limit,
      offset
    });
  }

  @Get("production-plan-imports/:id/rows")
  @ApiOperation({ summary: "Proxy list for normalized rows of one import batch." })
  @ApiOkResponse({ description: "Production plan rows returned." })
  async findRowsByBatchId(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<ProductionPlanImportRow[]> {
    return this.productionPlanImportsClient.findRowsByBatchId(id);
  }

  @Post("production-plan-imports/:id/activate")
  @HttpCode(200)
  @ApiOperation({ summary: "Proxy activate for one production plan import batch." })
  @ApiOkResponse({ description: "Production plan import batch activated." })
  async activateImport(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<ProductionPlanImportBatch> {
    return this.productionPlanImportsClient.activateImport(id);
  }

  @Delete("production-plan-imports/:id")
  @HttpCode(204)
  @ApiOperation({ summary: "Proxy delete for one production plan import batch." })
  async deleteImport(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<void> {
    await this.productionPlanImportsClient.deleteImport(id);
  }

  @Get("production-plan-weeks/:weekNumber/active-batch")
  @ApiOperation({ summary: "Proxy read for the active batch of one production week." })
  @ApiOkResponse({ description: "Active production plan import batch returned." })
  async findActiveBatchByWeekNumber(
    @Param("weekNumber", ParseIntPipe) weekNumber: number
  ): Promise<ProductionPlanImportBatch> {
    return this.productionPlanImportsClient.findActiveBatchByWeekNumber(
      weekNumber
    );
  }

  @Get("production-plan-weeks/:weekNumber/active-batch/rows")
  @ApiOperation({
    summary: "Proxy read for the active batch and its rows of one production week."
  })
  @ApiOkResponse({ description: "Active production plan rows returned." })
  async findActiveBatchRowsByWeekNumber(
    @Param("weekNumber", ParseIntPipe) weekNumber: number
  ): Promise<ProductionPlanActiveBatchRowsResponse> {
    return this.productionPlanImportsClient.findActiveBatchRowsByWeekNumber(
      weekNumber
    );
  }

  @Patch("production-plan-rows/:id")
  @ApiOperation({ summary: "Proxy row correction for one production plan row." })
  @ApiOkResponse({ description: "Production plan row updated." })
  async updateRow(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() request: UpdateProductionPlanRowRequestDto
  ): Promise<ProductionPlanImportRow> {
    return this.productionPlanImportsClient.updateRow(id, request);
  }
}
