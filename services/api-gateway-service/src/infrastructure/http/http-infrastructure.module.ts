import { Module } from "@nestjs/common";

import { CutListsClient } from "./cut-lists.client";
import { IdentityAuthClient } from "./identity-auth.client";
import { MainProfilesClient } from "./main-profiles.client";
import { OptimizationRequestsClient } from "./optimization-requests.client";
import { ProductionPlanImportsClient } from "./production-plan-imports.client";
import { ResultsClient } from "./results.client";
import { UpstreamService } from "./upstream.service";
import { UpstreamHttpClient } from "./upstream-http.client";

@Module({
  providers: [
    IdentityAuthClient,
    CutListsClient,
    MainProfilesClient,
    OptimizationRequestsClient,
    ProductionPlanImportsClient,
    ResultsClient,
    UpstreamHttpClient,
    UpstreamService
  ],
  exports: [
    IdentityAuthClient,
    CutListsClient,
    MainProfilesClient,
    OptimizationRequestsClient,
    ProductionPlanImportsClient,
    ResultsClient,
    UpstreamHttpClient,
    UpstreamService
  ]
})
export class HttpInfrastructureModule {}
