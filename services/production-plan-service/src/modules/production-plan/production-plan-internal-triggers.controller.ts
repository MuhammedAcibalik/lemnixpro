import { Controller, HttpCode, HttpStatus, Inject, Post } from "@nestjs/common";

import { ProductionPlanImportsService } from "./production-plan-imports.service";

@Controller("internal/production-plan/triggers")
export class ProductionPlanInternalTriggersController {
  constructor(
    @Inject(ProductionPlanImportsService)
    private readonly productionPlanImportsService: ProductionPlanImportsService
  ) {}

  @Post("cut-list-reconcile-active-batches")
  @HttpCode(HttpStatus.ACCEPTED)
  enqueueCutListReconcileActiveBatches(): Promise<{ enqueuedBatchCount: number }> {
    return this.productionPlanImportsService.enqueueCutListReconcileForAllActiveBatches();
  }
}
