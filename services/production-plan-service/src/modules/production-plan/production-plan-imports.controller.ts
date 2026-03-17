import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import { ProductionPlanImportBatchDetailResponseDto } from "./dto/production-plan-import-batch-detail-response.dto";
import { ProductionPlanImportBatchResponseDto } from "./dto/production-plan-import-batch-response.dto";
import { ProductionPlanImportRowResponseDto } from "./dto/production-plan-import-row-response.dto";
import { UpdateProductionPlanRowRequestDto } from "./dto/update-production-plan-row-request.dto";
import { MAX_IMPORT_FILE_SIZE_BYTES } from "./production-plan-import.parser";
import {
  type UploadedProductionPlanImportFile,
  ProductionPlanImportsService
} from "./production-plan-imports.service";

@ApiTags("production-plan-imports")
@Controller()
export class ProductionPlanImportsController {
  private readonly productionPlanImportsService: ProductionPlanImportsService;

  constructor(
    @Inject(ProductionPlanImportsService)
    productionPlanImportsService: ProductionPlanImportsService
  ) {
    this.productionPlanImportsService = productionPlanImportsService;
  }

  @Post("production-plan-imports")
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload and import a weekly production plan workbook." })
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
  @ApiCreatedResponse({ type: ProductionPlanImportBatchResponseDto })
  @ApiBadRequestResponse({
    description: "The upload is invalid or the workbook structure is not supported."
  })
  async createImport(
    @UploadedFile() file?: UploadedProductionPlanImportFile
  ): Promise<ProductionPlanImportBatchResponseDto> {
    return this.productionPlanImportsService.createImport(file);
  }

  @Get("production-plan-imports")
  @ApiOperation({ summary: "List production plan import batches newest first." })
  @ApiOkResponse({ type: ProductionPlanImportBatchResponseDto, isArray: true })
  async findAllImports(): Promise<ProductionPlanImportBatchResponseDto[]> {
    return this.productionPlanImportsService.findAllImports();
  }

  @Get("production-plan-imports/:id")
  @ApiOperation({ summary: "Get one production plan import batch summary." })
  @ApiOkResponse({ type: ProductionPlanImportBatchDetailResponseDto })
  @ApiNotFoundResponse({ description: "Production plan import batch was not found." })
  async findImportById(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<ProductionPlanImportBatchDetailResponseDto> {
    return this.productionPlanImportsService.findImportById(id);
  }

  @Get("production-plan-imports/:id/rows")
  @ApiOperation({ summary: "List normalized rows for one production plan import batch." })
  @ApiOkResponse({ type: ProductionPlanImportRowResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: "Production plan import batch was not found." })
  async findRowsByBatchId(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<ProductionPlanImportRowResponseDto[]> {
    return this.productionPlanImportsService.findRowsByBatchId(id);
  }

  @Patch("production-plan-rows/:id")
  @ApiOperation({ summary: "Apply a narrow correction to one production plan row." })
  @ApiOkResponse({ type: ProductionPlanImportRowResponseDto })
  @ApiBadRequestResponse({
    description: "The patch payload is invalid or no editable fields were provided."
  })
  @ApiNotFoundResponse({ description: "Production plan row was not found." })
  async updateRow(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() request: UpdateProductionPlanRowRequestDto
  ): Promise<ProductionPlanImportRowResponseDto> {
    return this.productionPlanImportsService.updateRow(id, request);
  }
}
