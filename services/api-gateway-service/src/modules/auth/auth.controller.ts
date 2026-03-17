import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";

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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Authenticate through the identity service." })
  @ApiOkResponse({ type: LoginResponseDto })
  async login(@Body() request: LoginRequestDto): Promise<LoginResponseDto> {
    return this.gatewayAuthService.login(request);
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
