import {
  Body,
  Controller,
  Get,
  Headers,
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
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import type { MainProfileCuttingRealignmentResult } from "@lemnixpro/shared-contracts";

import {
  resolveSingleFacilityContext,
  type FacilityRequestHeaders
} from "../../../common/facility-context";

import { CreateMainProfileRequestDto } from "./dto/create-main-profile-request.dto";
import { MainProfileImportBatchResponseDto } from "./dto/main-profile-import-batch-response.dto";
import { MainProfileResponseDto } from "./dto/main-profile-response.dto";
import { UpdateMainProfileRequestDto } from "./dto/update-main-profile-request.dto";
import {
  MainProfilesService,
  type UploadedMainProfileImportFile
} from "./main-profiles.service";

@ApiTags("main-profiles")
@Controller("main-profiles")
export class MainProfilesController {
  constructor(
    @Inject(MainProfilesService)
    private readonly mainProfilesService: MainProfilesService
  ) {}

  @Post("imports")
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Profil Yönetimi Excel dosyasını içeri aktarır." })
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
  @ApiCreatedResponse({ type: MainProfileImportBatchResponseDto })
  @ApiBadRequestResponse({ description: "Profil dosyası geçersiz." })
  async createImport(
    @Headers() headers: FacilityRequestHeaders,
    @UploadedFile() file?: UploadedMainProfileImportFile
  ): Promise<MainProfileImportBatchResponseDto> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.mainProfilesService.createImport(facilityId, file);
  }

  @Post()
  @ApiOperation({ summary: "Create a main profile master data record." })
  @ApiCreatedResponse({ type: MainProfileResponseDto })
  @ApiBadRequestResponse({ description: "Request payload failed validation." })
  @ApiConflictResponse({ description: "Main profile code already exists." })
  async create(
    @Headers() headers: FacilityRequestHeaders,
    @Body() request: CreateMainProfileRequestDto
  ): Promise<MainProfileResponseDto> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.mainProfilesService.create(facilityId, request);
  }

  @Get()
  @ApiOperation({ summary: "List all main profile master data records." })
  @ApiOkResponse({ type: MainProfileResponseDto, isArray: true })
  async findAll(
    @Headers() headers: FacilityRequestHeaders
  ): Promise<MainProfileResponseDto[]> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.mainProfilesService.findAll(facilityId);
  }

  @Post("maintenance/realign-cutting-specs")
  @ApiOperation({
    summary:
      "Kesim koduna göre yanlış profile yazılmış düz kesimleri doğru profile taşır (tek seferlik bakım)."
  })
  @ApiOkResponse({ description: "Taşınan kesim sayısı ve çözülemeyen kayıtlar." })
  async realignMisplacedCuttingSpecs(
    @Headers() headers: FacilityRequestHeaders
  ): Promise<MainProfileCuttingRealignmentResult> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.mainProfilesService.realignMisplacedCuttingSpecs(facilityId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a main profile by its identifier." })
  @ApiOkResponse({ type: MainProfileResponseDto })
  @ApiNotFoundResponse({ description: "Main profile was not found." })
  async findById(
    @Headers() headers: FacilityRequestHeaders,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<MainProfileResponseDto> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.mainProfilesService.findById(facilityId, id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a main profile master data record." })
  @ApiOkResponse({ type: MainProfileResponseDto })
  @ApiBadRequestResponse({
    description: "Request payload failed validation or no update fields were provided."
  })
  @ApiNotFoundResponse({ description: "Main profile was not found." })
  @ApiConflictResponse({ description: "Main profile code already exists." })
  async update(
    @Headers() headers: FacilityRequestHeaders,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() request: UpdateMainProfileRequestDto
  ): Promise<MainProfileResponseDto> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.mainProfilesService.update(facilityId, id, request);
  }

  @Patch(":id/activate")
  @ApiOperation({ summary: "Activate a main profile." })
  @ApiOkResponse({ type: MainProfileResponseDto })
  @ApiNotFoundResponse({ description: "Main profile was not found." })
  async activate(
    @Headers() headers: FacilityRequestHeaders,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<MainProfileResponseDto> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.mainProfilesService.activate(facilityId, id);
  }

  @Patch(":id/deactivate")
  @ApiOperation({ summary: "Deactivate a main profile." })
  @ApiOkResponse({ type: MainProfileResponseDto })
  @ApiNotFoundResponse({ description: "Main profile was not found." })
  async deactivate(
    @Headers() headers: FacilityRequestHeaders,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<MainProfileResponseDto> {
    const { facilityId } = resolveSingleFacilityContext(headers);

    return this.mainProfilesService.deactivate(facilityId, id);
  }
}
