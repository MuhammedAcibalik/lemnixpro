import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";

import type { JwtClaims } from "@lemnixpro/shared-contracts";

import { AuthService } from "./auth.service";
import { CurrentUserResponseDto } from "./dto/current-user-response.dto";
import { LoginRequestDto } from "./dto/login-request.dto";
import { LoginResponseDto } from "./dto/login-response.dto";
import { BootstrapAdminResponseDto } from "./dto/bootstrap-admin-response.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

type AuthenticatedRequest = {
  user: JwtClaims;
};

type RequestHeaders = Record<string, string | string[] | undefined>;

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService
  ) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Authenticate a user and issue an access token." })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: "Invalid email or password." })
  @ApiForbiddenResponse({ description: "User account is inactive." })
  async login(@Body() request: LoginRequestDto): Promise<LoginResponseDto> {
    return this.authService.login(request);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Return the current authenticated user." })
  @ApiOkResponse({ type: CurrentUserResponseDto })
  @ApiUnauthorizedResponse({ description: "Bearer token is missing or invalid." })
  @ApiForbiddenResponse({ description: "User account is inactive." })
  async getCurrentUser(
    @Req() request: AuthenticatedRequest
  ): Promise<CurrentUserResponseDto> {
    return this.authService.getCurrentUser(request.user.sub);
  }

  @Post("bootstrap-admin")
  @ApiOperation({ summary: "Create the first admin user in non-production environments." })
  @ApiHeader({
    name: "X-Bootstrap-Secret",
    required: true,
    description: "Bootstrap secret configured in BOOTSTRAP_ADMIN_SECRET."
  })
  @ApiCreatedResponse({ type: BootstrapAdminResponseDto })
  @ApiForbiddenResponse({ description: "Bootstrap admin flow is disabled." })
  async bootstrapAdmin(
    @Headers() headers: RequestHeaders
  ): Promise<BootstrapAdminResponseDto> {
    const bootstrapSecret = this.getSingleHeader(
      headers["x-bootstrap-secret"]
    );

    return this.authService.bootstrapAdmin(bootstrapSecret);
  }

  private getSingleHeader(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
