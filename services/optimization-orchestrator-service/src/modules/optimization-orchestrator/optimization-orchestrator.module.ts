import { Module } from "@nestjs/common";

import { InfrastructureModule } from "../../infrastructure/infrastructure.module";

import { OptimizationRequestsController } from "./optimization-requests.controller";
import { OptimizationLifecycleEventsConsumer } from "./optimization-lifecycle-events.consumer";
import { OptimizationLifecycleService } from "./optimization-lifecycle.service";
import { OptimizationRequestsRepository } from "./optimization-requests.repository";
import { OptimizationRequestsService } from "./optimization-requests.service";
import { OptimizationRequestsV2Controller } from "./optimization-requests-v2.controller";
import { OptimizationRequestsV2InternalController } from "./optimization-requests-v2-internal.controller";
import { OptimizationRequestsV2Service } from "./optimization-requests-v2.service";

@Module({
  imports: [InfrastructureModule],
  controllers: [
    OptimizationRequestsController,
    OptimizationRequestsV2Controller,
    OptimizationRequestsV2InternalController
  ],
  providers: [
    OptimizationRequestsService,
    OptimizationRequestsV2Service,
    OptimizationLifecycleService,
    OptimizationLifecycleEventsConsumer,
    OptimizationRequestsRepository
  ]
})
export class OptimizationOrchestratorModule {}
