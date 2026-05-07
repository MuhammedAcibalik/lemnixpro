import { Module } from "@nestjs/common";

import { InfrastructureModule } from "../../infrastructure/infrastructure.module";
import { ProductionPlanCutListReconcileTriggerService } from "../../infrastructure/integration/production-plan-cut-list-reconcile-trigger.service";

import { MainProfileImportParser } from "./main-profiles/main-profile-import.parser";
import { MainProfilesController } from "./main-profiles/main-profiles.controller";
import { MainProfilesRepository } from "./main-profiles/main-profiles.repository";
import { MainProfilesService } from "./main-profiles/main-profiles.service";

@Module({
  imports: [InfrastructureModule],
  controllers: [MainProfilesController],
  providers: [
    MainProfilesService,
    MainProfilesRepository,
    MainProfileImportParser,
    ProductionPlanCutListReconcileTriggerService
  ]
})
export class MasterDataModule {}
