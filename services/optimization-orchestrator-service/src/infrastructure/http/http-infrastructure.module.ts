import { Module } from "@nestjs/common";

import { MasterDataClient } from "./master-data.client";
import { ProductionPlanClient } from "./production-plan.client";
import { UpstreamService } from "./upstream.service";

@Module({
  providers: [MasterDataClient, ProductionPlanClient, UpstreamService],
  exports: [MasterDataClient, ProductionPlanClient, UpstreamService]
})
export class HttpInfrastructureModule {}
