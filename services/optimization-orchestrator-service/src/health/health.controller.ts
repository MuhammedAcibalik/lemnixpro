import { Controller, Get, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";

import type { HealthResponse } from "@lemnixpro/shared-contracts";
import { isoNow } from "@lemnixpro/shared-utils";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  @Get("live")
  getLiveness(): HealthResponse {
    return this.buildResponse("live", ["application-process"]);
  }

  @Get("ready")
  getReadiness(): HealthResponse {
    return this.buildResponse("ready", ["configuration-loaded"]);
  }

  private buildResponse(
    status: HealthResponse["status"],
    checks: string[]
  ): HealthResponse {
    return {
      service: this.configService.getOrThrow<HealthResponse["service"]>(
        "SERVICE_NAME"
      ),
      status,
      timestamp: isoNow(),
      checks
    };
  }
}
