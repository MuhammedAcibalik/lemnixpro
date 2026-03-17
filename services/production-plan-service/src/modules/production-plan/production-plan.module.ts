import { Module } from "@nestjs/common";

import { InfrastructureModule } from "../../infrastructure/infrastructure.module";

import { ProductionPlanImportsController } from "./production-plan-imports.controller";
import { ProductionPlanImportParser } from "./production-plan-import.parser";
import { ProductionPlanImportsRepository } from "./production-plan-imports.repository";
import { ProductionPlanImportsService } from "./production-plan-imports.service";

@Module({
  imports: [InfrastructureModule],
  controllers: [ProductionPlanImportsController],
  providers: [
    ProductionPlanImportParser,
    ProductionPlanImportsService,
    ProductionPlanImportsRepository
  ]
})
export class ProductionPlanModule {}
