import { Module } from "@nestjs/common";

import { HttpInfrastructureModule } from "../../infrastructure/http/http-infrastructure.module";

import { ProductionPlanController } from "./production-plan.controller";

@Module({
  imports: [HttpInfrastructureModule],
  controllers: [ProductionPlanController]
})
export class ProductionPlanModule {}
