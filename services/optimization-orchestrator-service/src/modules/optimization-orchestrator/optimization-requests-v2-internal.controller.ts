import {
  Controller,
  ForbiddenException,
  Headers,
  Inject,
  Param,
  Post
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  type OptimizationRequestClaimResponse,
  requestHeaders
} from "@lemnixpro/shared-contracts";

import { OptimizationRequestsV2Service } from "./optimization-requests-v2.service";

@Controller("internal/optimization-requests/v2")
export class OptimizationRequestsV2InternalController {
  constructor(
    @Inject(OptimizationRequestsV2Service)
    private readonly optimizationRequestsV2Service: OptimizationRequestsV2Service,
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  @Post(":id/claim")
  async claim(
    @Param("id") id: string,
    @Headers(requestHeaders.internalServiceToken) token: string | undefined,
    /** @deprecated Older optimization-engine builds; prefer `requestHeaders.internalServiceToken`. */
    @Headers("x-internal-service-secret") legacySecret: string | undefined
  ): Promise<OptimizationRequestClaimResponse> {
    this.assertInternalSecret(token ?? legacySecret);
    return this.optimizationRequestsV2Service.claimRequest(id);
  }

  private assertInternalSecret(secret: string | undefined): void {
    const expected = this.configService.get<string>(
      "INTERNAL_SERVICE_AUTH_SECRET",
      ""
    );

    if (!expected || secret !== expected) {
      throw new ForbiddenException({
        code: "internal_auth_failed",
        message: "Internal service authentication failed."
      });
    }
  }
}
