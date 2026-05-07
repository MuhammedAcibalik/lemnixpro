import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";

import { GatewayAuthService } from "./gateway-auth.service";
import { CurrentUserResponseDto } from "./dto/current-user-response.dto";
import { LoginRequestDto } from "./dto/login-request.dto";
import { LoginResponseDto } from "./dto/login-response.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(GatewayAuthService)
    private readonly gatewayAuthService: GatewayAuthService
  ) {}

  @Post("login")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Authenticate through the identity service." })
  @ApiOkResponse({ type: LoginResponseDto })
  async login(@Body() request: LoginRequestDto): Promise<LoginResponseDto> {
    return this.gatewayAuthService.login(request);
  }

  @Post("bootstrap-admin")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      "Create the initial admin via identity bootstrap (ALLOW_BOOTSTRAP_ADMIN + BOOTSTRAP_* on identity)."
  })
  @ApiHeader({
    name: "X-Bootstrap-Secret",
    description: "Must match identity BOOTSTRAP_ADMIN_SECRET.",
    required: true
  })
  @ApiCreatedResponse({ type: CurrentUserResponseDto })
  @ApiForbiddenResponse({
    description: "Bootstrap disabled, wrong secret, or admin already exists."
  })
  async bootstrapAdmin(
    @Headers("x-bootstrap-secret") secret?: string | string[]
  ): Promise<CurrentUserResponseDto> {
    const value =
      typeof secret === "string" ? secret.trim() : (Array.isArray(secret) ? secret[0]?.trim() : "");

    if (!value) {
      throw new BadRequestException('Header "X-Bootstrap-Secret" is required.');
    }

    return this.gatewayAuthService.bootstrapAdmin(value);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Return the current authenticated user via identity-service." })
  @ApiOkResponse({ type: CurrentUserResponseDto })
  @ApiUnauthorizedResponse({ description: "Bearer token is missing or invalid." })
  async getCurrentUser(
    @Headers() headers: Record<string, string | string[] | undefined>
  ): Promise<CurrentUserResponseDto> {
    const authorizationHeader = this.getSingleHeader(headers.authorization);

    return this.gatewayAuthService.getCurrentUser(authorizationHeader);
  }

  private getSingleHeader(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
