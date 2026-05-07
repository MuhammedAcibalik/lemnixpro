import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";

import type { JwtClaims } from "@lemnixpro/shared-contracts";

import {
  FacilityAccessCheckRequestDto,
  FacilityAccessCheckResponseDto,
  SetUserFacilityGrantsRequestDto,
  UserFacilityAccessResponseDto
} from "./dto/facility-access.dto";
import { FacilityAccessService } from "./facility-access.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

type AuthenticatedRequest = {
  user: JwtClaims;
};

@ApiTags("facility-access")
@Controller()
export class FacilityAccessController {
  constructor(
    @Inject(FacilityAccessService)
    private readonly facilityAccessService: FacilityAccessService
  ) {}

  @Get("users/:id/facility-access")
  @ApiOperation({
    summary: "Return identity-owned facility/module grants for one user."
  })
  @ApiOkResponse({ type: UserFacilityAccessResponseDto })
  @ApiNotFoundResponse({ description: "User was not found." })
  async getUserFacilityAccess(
    @Param("id", new ParseUUIDPipe({ version: "4" })) userId: string
  ): Promise<UserFacilityAccessResponseDto> {
    return this.facilityAccessService.getAccessForUser(userId);
  }

  @Put("users/:id/facility-grants")
  @ApiOperation({
    summary: "Replace identity-owned facility/module grants for one user."
  })
  @ApiOkResponse({ type: UserFacilityAccessResponseDto })
  @ApiBadRequestResponse({
    description: "Grant payload is invalid or violates grant invariants."
  })
  @ApiNotFoundResponse({ description: "User was not found." })
  async replaceUserFacilityGrants(
    @Param("id", new ParseUUIDPipe({ version: "4" })) userId: string,
    @Body() request: SetUserFacilityGrantsRequestDto
  ): Promise<UserFacilityAccessResponseDto> {
    return this.facilityAccessService.replaceGrantsForUser(userId, request);
  }

  @Get("auth/me/facility-access")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Return facility/module grants for the authenticated user."
  })
  @ApiOkResponse({ type: UserFacilityAccessResponseDto })
  @ApiUnauthorizedResponse({ description: "Bearer token is missing or invalid." })
  async getCurrentUserFacilityAccess(
    @Req() request: AuthenticatedRequest
  ): Promise<UserFacilityAccessResponseDto> {
    return this.facilityAccessService.getAccessForUser(request.user.sub);
  }

  @Post("auth/me/facility-access/resolve")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Resolve whether the authenticated user may use a facility context."
  })
  @ApiOkResponse({ type: FacilityAccessCheckResponseDto })
  @ApiUnauthorizedResponse({ description: "Bearer token is missing or invalid." })
  async resolveCurrentUserFacilityAccess(
    @Req() request: AuthenticatedRequest,
    @Body() body: FacilityAccessCheckRequestDto
  ): Promise<FacilityAccessCheckResponseDto> {
    return this.facilityAccessService.resolveAccessForUser(
      request.user.sub,
      body
    );
  }
}
