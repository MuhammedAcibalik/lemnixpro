import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import { CreateMainProfileRequestDto } from "./dto/create-main-profile-request.dto";
import { MainProfileResponseDto } from "./dto/main-profile-response.dto";
import { UpdateMainProfileRequestDto } from "./dto/update-main-profile-request.dto";
import { MainProfilesService } from "./main-profiles.service";

@ApiTags("main-profiles")
@Controller("main-profiles")
export class MainProfilesController {
  constructor(
    @Inject(MainProfilesService)
    private readonly mainProfilesService: MainProfilesService
  ) {}

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
