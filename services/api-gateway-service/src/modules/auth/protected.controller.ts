import { Controller, Get, Headers, Inject, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";

import { GatewayAuthService } from "./gateway-auth.service";
import { ProtectedPingResponseDto } from "./dto/protected-ping-response.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

@ApiTags("protected")
@Controller("protected")
export class ProtectedController {
  constructor(
    @Inject(GatewayAuthService)
    private readonly gatewayAuthService: GatewayAuthService
  ) {}

  @Get("ping")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Validate gateway JWT auth and confirm identity once." })
  @ApiOkResponse({ type: ProtectedPingResponseDto })
  @ApiUnauthorizedResponse({ description: "Bearer token is missing or invalid." })
  async ping(
    @Headers() headers: Record<string, string | string[] | undefined>
  ): Promise<ProtectedPingResponseDto> {
    const authorizationHeader = this.getSingleHeader(headers.authorization);

    return this.gatewayAuthService.protectedPing(authorizationHeader);
  }

  private getSingleHeader(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
