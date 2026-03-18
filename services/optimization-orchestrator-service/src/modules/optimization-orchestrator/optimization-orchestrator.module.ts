import { Module } from "@nestjs/common";

import { InfrastructureModule } from "../../infrastructure/infrastructure.module";

import { OptimizationRequestsController } from "./optimization-requests.controller";
import { OptimizationRequestsRepository } from "./optimization-requests.repository";
import { OptimizationRequestsService } from "./optimization-requests.service";

@Module({
  imports: [InfrastructureModule],
  controllers: [OptimizationRequestsController],
  providers: [OptimizationRequestsService, OptimizationRequestsRepository]
})
export class OptimizationOrchestratorModule {}
