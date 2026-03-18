import { Module } from "@nestjs/common";

import { InfrastructureModule } from "../../infrastructure/infrastructure.module";

import { OptimizationRequestsController } from "./optimization-requests.controller";
import { OptimizationRequestsService } from "./optimization-requests.service";

@Module({
  imports: [InfrastructureModule],
  controllers: [OptimizationRequestsController],
  providers: [OptimizationRequestsService]
})
export class OptimizationOrchestratorModule {}
