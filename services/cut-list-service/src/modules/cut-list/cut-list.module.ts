import { Module } from "@nestjs/common";

import { InfrastructureModule } from "../../infrastructure/infrastructure.module";

import { CutListsController } from "./cut-lists.controller";
import { CutListsRepository } from "./cut-lists.repository";
import { CutListsService } from "./cut-lists.service";
import { ProductionPlanBatchActivatedConsumer } from "./production-plan-batch-activated.consumer";
import { ProductionPlanCutListReconcileConsumer } from "./production-plan-cut-list-reconcile.consumer";

@Module({
  imports: [InfrastructureModule],
  controllers: [CutListsController],
  providers: [
    CutListsService,
    CutListsRepository,
    ProductionPlanBatchActivatedConsumer,
    ProductionPlanCutListReconcileConsumer
  ]
})
export class CutListModule {}
