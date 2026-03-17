import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";

import type { ServiceInfoResponse } from "@lemnixpro/shared-contracts";

@ApiTags("service-info")
@Controller("service-info")
export class ServiceInfoController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getServiceInfo(): ServiceInfoResponse {
    return {
      service: this.configService.getOrThrow<ServiceInfoResponse["service"]>(
        "SERVICE_NAME"
      ),
      version: "0.1.0",
      environment: this.configService.get<string>("NODE_ENV", "development")
    };
  }
}
