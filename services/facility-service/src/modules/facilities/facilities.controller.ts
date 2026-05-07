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

import { CreateFacilityRequestDto } from "./dto/create-facility-request.dto";
import { FacilityResponseDto } from "./dto/facility-response.dto";
import { UpdateFacilityRequestDto } from "./dto/update-facility-request.dto";
import { FacilitiesService } from "./facilities.service";

@ApiTags("facilities")
@Controller("facilities")
export class FacilitiesController {
  constructor(
    @Inject(FacilitiesService)
    private readonly facilitiesService: FacilitiesService
  ) {}

  @Post()
  @ApiOperation({ summary: "Create a physical production facility." })
  @ApiCreatedResponse({ type: FacilityResponseDto })
  @ApiBadRequestResponse({ description: "Request payload failed validation." })
  @ApiConflictResponse({ description: "Facility code already exists." })
  async create(
    @Body() request: CreateFacilityRequestDto
  ): Promise<FacilityResponseDto> {
    return this.facilitiesService.create(request);
  }

  @Get()
  @ApiOperation({ summary: "List all facilities, including inactive records." })
  @ApiOkResponse({ type: FacilityResponseDto, isArray: true })
  async findAll(): Promise<FacilityResponseDto[]> {
    return this.facilitiesService.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a facility by its identifier." })
  @ApiOkResponse({ type: FacilityResponseDto })
  @ApiNotFoundResponse({ description: "Facility was not found." })
  async findById(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<FacilityResponseDto> {
    return this.facilitiesService.findById(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a facility." })
  @ApiOkResponse({ type: FacilityResponseDto })
  @ApiBadRequestResponse({
    description: "Request payload failed validation or no fields were provided."
  })
  @ApiConflictResponse({ description: "Facility code already exists." })
  @ApiNotFoundResponse({ description: "Facility was not found." })
  async update(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() request: UpdateFacilityRequestDto
  ): Promise<FacilityResponseDto> {
    return this.facilitiesService.update(id, request);
  }

  @Patch(":id/activate")
  @ApiOperation({ summary: "Activate a facility." })
  @ApiOkResponse({ type: FacilityResponseDto })
  @ApiNotFoundResponse({ description: "Facility was not found." })
  async activate(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<FacilityResponseDto> {
    return this.facilitiesService.activate(id);
  }

  @Patch(":id/deactivate")
  @ApiOperation({ summary: "Deactivate a facility." })
  @ApiOkResponse({ type: FacilityResponseDto })
  @ApiNotFoundResponse({ description: "Facility was not found." })
  async deactivate(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<FacilityResponseDto> {
    return this.facilitiesService.deactivate(id);
  }
}
