import { Module } from "@nestjs/common";

import { IdentityAuthClient } from "./identity-auth.client";
import { UpstreamService } from "./upstream.service";

@Module({
  providers: [IdentityAuthClient, UpstreamService],
  exports: [IdentityAuthClient, UpstreamService]
})
export class HttpInfrastructureModule {}
