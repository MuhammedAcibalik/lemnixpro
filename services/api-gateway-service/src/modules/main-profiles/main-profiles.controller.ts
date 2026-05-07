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
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import type {
  MainProfile,
  MainProfileCuttingRealignmentResult,
  MainProfileImportBatch
} from "@lemnixpro/shared-contracts";

import {
  MainProfilesClient,
  type UploadedMainProfileFile
} from "../../infrastructure/http/main-profiles.client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

import { CreateMainProfileRequestDto } from "./dto/create-main-profile-request.dto";
import { UpdateMainProfileRequestDto } from "./dto/update-main-profile-request.dto";

@ApiTags("main-profiles")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("main-profiles")
export class MainProfilesController {
  constructor(
    @Inject(MainProfilesClient)
    private readonly mainProfilesClient: MainProfilesClient
  ) {}

  @Post("imports")
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Proxy upload for a Profile Management workbook." })
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
  @ApiCreatedResponse({ description: "Main profile import batch created." })
  async createImport(
    @UploadedFile() file?: UploadedMainProfileFile
  ): Promise<MainProfileImportBatch> {
    return this.mainProfilesClient.createImport(file);
  }

  @Post()
  @ApiOperation({ summary: "Proxy create for a main profile master data record." })
  @ApiCreatedResponse({ description: "Main profile created." })
  async create(
    @Body() request: CreateMainProfileRequestDto
  ): Promise<MainProfile> {
    return this.mainProfilesClient.create(request);
  }

  @Get()
  @ApiOperation({ summary: "Proxy list for all main profile master data records." })
  @ApiOkResponse({ description: "Main profile list returned." })
  async findAll(): Promise<MainProfile[]> {
    return this.mainProfilesClient.findAll();
  }

  @Post("maintenance/realign-cutting-specs")
  @ApiOperation({
    summary:
      "Proxy maintenance: realign misplaced cutting specs to the correct profile code."
  })
  @ApiOkResponse({ description: "Realignment summary." })
  async realignMisplacedCuttingSpecs(): Promise<MainProfileCuttingRealignmentResult> {
    return this.mainProfilesClient.realignMisplacedCuttingSpecs();
  }

  @Get(":id")
  @ApiOperation({ summary: "Proxy read for one main profile." })
  @ApiOkResponse({ description: "Main profile returned." })
  async findById(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<MainProfile> {
    return this.mainProfilesClient.findById(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Proxy update for one main profile." })
  @ApiOkResponse({ description: "Main profile updated." })
  async update(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() request: UpdateMainProfileRequestDto
  ): Promise<MainProfile> {
    return this.mainProfilesClient.update(id, request);
  }

  @Patch(":id/activate")
  @ApiOperation({ summary: "Proxy activate for one main profile." })
  @ApiOkResponse({ description: "Main profile activated." })
  async activate(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<MainProfile> {
    return this.mainProfilesClient.activate(id);
  }

  @Patch(":id/deactivate")
  @ApiOperation({ summary: "Proxy deactivate for one main profile." })
  @ApiOkResponse({ description: "Main profile deactivated." })
  async deactivate(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<MainProfile> {
    return this.mainProfilesClient.deactivate(id);
  }
}
