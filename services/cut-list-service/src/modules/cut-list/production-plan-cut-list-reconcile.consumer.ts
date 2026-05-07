import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { RabbitMqService } from "../../infrastructure/messaging/rabbitmq.service";

import { CutListsService } from "./cut-lists.service";

@Injectable()
export class ProductionPlanCutListReconcileConsumer implements OnModuleInit {
  private readonly logger = new Logger(ProductionPlanCutListReconcileConsumer.name);

  constructor(
    @Inject(RabbitMqService)
    private readonly rabbitMqService: RabbitMqService,
    @Inject(CutListsService)
    private readonly cutListsService: CutListsService
  ) {}

  onModuleInit(): void {
    this.rabbitMqService.consumeProductionPlanCutListReconcile(async (event) => {
      const snapshot = await this.cutListsService.refreshSnapshotForCutListReconcile(
        event
      );

      this.logger.log(
        `Cut list snapshot ${snapshot.snapshot.id} reconciled for ${event.planYear}/W${event.weekNumber}.`
      );
    });
  }
}
