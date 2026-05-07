import { Module } from "@nestjs/common";

import { CutListClient } from "./cut-list.client";
import { MasterDataClient } from "./master-data.client";
import { ProductionPlanClient } from "./production-plan.client";
import { ResultServiceClient } from "./result-service.client";
import { UpstreamService } from "./upstream.service";

@Module({
  providers: [
    MasterDataClient,
    ProductionPlanClient,
    CutListClient,
    ResultServiceClient,
    UpstreamService
  ],
  exports: [
    MasterDataClient,
    ProductionPlanClient,
    CutListClient,
    ResultServiceClient,
    UpstreamService
  ]
})
export class HttpInfrastructureModule {}
