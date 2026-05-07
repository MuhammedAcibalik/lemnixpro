import { Module } from "@nestjs/common";

import { InfrastructureModule } from "../../infrastructure/infrastructure.module";

import { ProductionPlanImportsController } from "./production-plan-imports.controller";
import { ProductionPlanInternalTriggersController } from "./production-plan-internal-triggers.controller";
import { ProductionPlanImportParser } from "./production-plan-import.parser";
import { ProductionPlanImportsRepository } from "./production-plan-imports.repository";
import { ProductionPlanImportsService } from "./production-plan-imports.service";
import { ProductionPlanOutboxDispatcher } from "./production-plan-outbox.dispatcher";

@Module({
  imports: [InfrastructureModule],
  controllers: [
    ProductionPlanImportsController,
    ProductionPlanInternalTriggersController
  ],
  providers: [
    ProductionPlanImportParser,
    ProductionPlanImportsService,
    ProductionPlanImportsRepository,
    ProductionPlanOutboxDispatcher
  ]
})
export class ProductionPlanModule {}
