import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  ValidationPipe,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import { ProductionPlanActiveBatchRowsResponseDto } from "./dto/production-plan-active-batch-rows-response.dto";
import { ProductionPlanImportBatchDetailResponseDto } from "./dto/production-plan-import-batch-detail-response.dto";
import { ProductionPlanImportBatchResponseDto } from "./dto/production-plan-import-batch-response.dto";
import { ProductionPlanImportRowResponseDto } from "./dto/production-plan-import-row-response.dto";
import { ProductionPlanImportRowsPageResponseDto } from "./dto/production-plan-import-rows-page-response.dto";
import { UpdateProductionPlanRowRequestDto } from "./dto/update-production-plan-row-request.dto";
import { ParseProductionPlanWeekNumberPipe } from "./parse-production-plan-week-number.pipe";
import {
  resolveSingleFacilityContext,
  type FacilityRequestHeaders
} from "../../common/facility-context";

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
    @Headers() headers: FacilityRequestHeaders,
    @UploadedFile() file?: UploadedProductionPlanImportFile
  ): Promise<ProductionPlanImportBatchResponseDto> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.productionPlanImportsService.createImport(facilityId, file);
  }

  @Get("production-plan-imports")
  @ApiOperation({ summary: "List production plan import batches newest first." })
  @ApiOkResponse({ type: ProductionPlanImportBatchResponseDto, isArray: true })
  async findAllImports(
    @Headers() headers: FacilityRequestHeaders
  ): Promise<ProductionPlanImportBatchResponseDto[]> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.productionPlanImportsService.findAllImports(facilityId);
  }

  @Get("production-plan-weeks/:weekNumber/batches")
  @ApiOperation({
    summary:
      "List production plan import batches for one week by lifecycle priority and recency."
  })
  @ApiOkResponse({ type: ProductionPlanImportBatchResponseDto, isArray: true })
  @ApiBadRequestResponse({
    description: "weekNumber must be a positive integer."
  })
  async findImportsByWeekNumber(
    @Headers() headers: FacilityRequestHeaders,
    @Param("weekNumber", new ParseProductionPlanWeekNumberPipe())
    weekNumber: number
  ): Promise<ProductionPlanImportBatchResponseDto[]> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.productionPlanImportsService.findImportsByWeekNumber(
      facilityId,
      weekNumber
    );
  }

  @Get("production-plan-imports/:id")
  @ApiOperation({ summary: "Get one production plan import batch summary." })
  @ApiOkResponse({ type: ProductionPlanImportBatchDetailResponseDto })
  @ApiNotFoundResponse({ description: "Production plan import batch was not found." })
  async findImportById(
    @Headers() headers: FacilityRequestHeaders,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<ProductionPlanImportBatchDetailResponseDto> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.productionPlanImportsService.findImportById(facilityId, id);
  }

  @Get("production-plan-imports/:id/rows/paged")
  @ApiOperation({
    summary:
      "List normalized rows for one import batch with limit/offset (max limit 500)."
  })
  @ApiOkResponse({ type: ProductionPlanImportRowsPageResponseDto })
  @ApiNotFoundResponse({ description: "Production plan import batch was not found." })
  async findRowsByBatchIdPaged(
    @Headers() headers: FacilityRequestHeaders,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query("limit", new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number
  ): Promise<ProductionPlanImportRowsPageResponseDto> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.productionPlanImportsService.findRowsByBatchIdPaged(
      facilityId,
      id,
      limit,
      offset
    );
  }

  @Get("production-plan-imports/:id/rows")
  @ApiOperation({ summary: "List normalized rows for one production plan import batch." })
  @ApiOkResponse({ type: ProductionPlanImportRowResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: "Production plan import batch was not found." })
  async findRowsByBatchId(
    @Headers() headers: FacilityRequestHeaders,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<ProductionPlanImportRowResponseDto[]> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.productionPlanImportsService.findRowsByBatchId(facilityId, id);
  }

  @Delete("production-plan-imports/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete one production plan import batch and all of its rows."
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: "Batch deleted." })
  @ApiNotFoundResponse({ description: "Production plan import batch was not found." })
  async deleteImport(
    @Headers() headers: FacilityRequestHeaders,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<void> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.productionPlanImportsService.deleteImport(facilityId, id);
  }

  @Post("production-plan-imports/:id/activate")
  @HttpCode(200)
  @ApiOperation({ summary: "Activate one production plan import batch." })
  @ApiOkResponse({ type: ProductionPlanImportBatchResponseDto })
  @ApiNotFoundResponse({ description: "Production plan import batch was not found." })
  @ApiConflictResponse({
    description:
      "Batch cannot be activated (no valid rows, missing week on valid rows, or conflicting weeks). Row counts are reconciled from stored rows before checks; batch week may be inferred from valid rows when missing."
  })
  async activateImport(
    @Headers() headers: FacilityRequestHeaders,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<ProductionPlanImportBatchResponseDto> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.productionPlanImportsService.activateImport(facilityId, id);
  }

  @Get("production-plan-weeks/:weekNumber/active-batch/rows")
  @ApiOperation({
    summary:
      "Get the active production plan import batch and its normalized rows for one week."
  })
  @ApiOkResponse({ type: ProductionPlanActiveBatchRowsResponseDto })
  @ApiBadRequestResponse({
    description: "weekNumber must be a positive integer."
  })
  @ApiNotFoundResponse({
    description: "No active production plan import batch exists for the requested week."
  })
  async findActiveBatchRowsByWeekNumber(
    @Headers() headers: FacilityRequestHeaders,
    @Param("weekNumber", new ParseProductionPlanWeekNumberPipe())
    weekNumber: number
  ): Promise<ProductionPlanActiveBatchRowsResponseDto> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.productionPlanImportsService.findActiveBatchRowsByWeekNumber(
      facilityId,
      weekNumber
    );
  }

  @Get("production-plan-weeks/:weekNumber/active-batch")
  @ApiOperation({ summary: "Get the active production plan import batch for one week." })
  @ApiOkResponse({ type: ProductionPlanImportBatchResponseDto })
  @ApiBadRequestResponse({
    description: "weekNumber must be a positive integer."
  })
  @ApiNotFoundResponse({
    description: "No active production plan import batch exists for the requested week."
  })
  async findActiveBatchByWeekNumber(
    @Headers() headers: FacilityRequestHeaders,
    @Param("weekNumber", new ParseProductionPlanWeekNumberPipe())
    weekNumber: number
  ): Promise<ProductionPlanImportBatchResponseDto> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.productionPlanImportsService.findActiveBatchByWeekNumber(
      facilityId,
      weekNumber
    );
  }

  @Patch("production-plan-rows/:id")
  @ApiOperation({ summary: "Apply a narrow correction to one production plan row." })
  @ApiOkResponse({ type: ProductionPlanImportRowResponseDto })
  @ApiBadRequestResponse({
    description: "The patch payload is invalid or no editable fields were provided."
  })
  @ApiNotFoundResponse({ description: "Production plan row was not found." })
  @ApiConflictResponse({
    description: "An active production plan import batch must retain at least one valid row."
  })
  async updateRow(
    @Headers() headers: FacilityRequestHeaders,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        expectedType: UpdateProductionPlanRowRequestDto
      })
    )
    request: UpdateProductionPlanRowRequestDto
  ): Promise<ProductionPlanImportRowResponseDto> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.productionPlanImportsService.updateRow(facilityId, id, request);
  }
}
