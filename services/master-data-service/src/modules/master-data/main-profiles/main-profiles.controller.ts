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
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import type { MainProfileCuttingRealignmentResult } from "@lemnixpro/shared-contracts";

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
    @UploadedFile() file?: UploadedMainProfileImportFile
  ): Promise<MainProfileImportBatchResponseDto> {
    return this.mainProfilesService.createImport(file);
  }

  @Post()
  @ApiOperation({ summary: "Create a main profile master data record." })
  @ApiCreatedResponse({ type: MainProfileResponseDto })
  @ApiBadRequestResponse({ description: "Request payload failed validation." })
  @ApiConflictResponse({ description: "Main profile code already exists." })
  async create(
    @Body() request: CreateMainProfileRequestDto
  ): Promise<MainProfileResponseDto> {
    return this.mainProfilesService.create(request);
  }

  @Get()
  @ApiOperation({ summary: "List all main profile master data records." })
  @ApiOkResponse({ type: MainProfileResponseDto, isArray: true })
  async findAll(): Promise<MainProfileResponseDto[]> {
    return this.mainProfilesService.findAll();
  }

  @Post("maintenance/realign-cutting-specs")
  @ApiOperation({
    summary:
      "Kesim koduna göre yanlış profile yazılmış düz kesimleri doğru profile taşır (tek seferlik bakım)."
  })
  @ApiOkResponse({ description: "Taşınan kesim sayısı ve çözülemeyen kayıtlar." })
  async realignMisplacedCuttingSpecs(): Promise<MainProfileCuttingRealignmentResult> {
    return this.mainProfilesService.realignMisplacedCuttingSpecs();
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a main profile by its identifier." })
  @ApiOkResponse({ type: MainProfileResponseDto })
  @ApiNotFoundResponse({ description: "Main profile was not found." })
  async findById(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<MainProfileResponseDto> {
    return this.mainProfilesService.findById(id);
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
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() request: UpdateMainProfileRequestDto
  ): Promise<MainProfileResponseDto> {
    return this.mainProfilesService.update(id, request);
  }

  @Patch(":id/activate")
  @ApiOperation({ summary: "Activate a main profile." })
  @ApiOkResponse({ type: MainProfileResponseDto })
  @ApiNotFoundResponse({ description: "Main profile was not found." })
  async activate(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<MainProfileResponseDto> {
    return this.mainProfilesService.activate(id);
  }

  @Patch(":id/deactivate")
  @ApiOperation({ summary: "Deactivate a main profile." })
  @ApiOkResponse({ type: MainProfileResponseDto })
  @ApiNotFoundResponse({ description: "Main profile was not found." })
  async deactivate(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<MainProfileResponseDto> {
    return this.mainProfilesService.deactivate(id);
  }
}
