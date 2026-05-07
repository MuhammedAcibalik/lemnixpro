import { Module } from "@nestjs/common";

import { HttpInfrastructureModule } from "../../infrastructure/http/http-infrastructure.module";

import { OptimizationRequestsController } from "./optimization-requests.controller";

@Module({
  imports: [HttpInfrastructureModule],
  controllers: [OptimizationRequestsController]
})
export class OptimizationRequestsModule {}
