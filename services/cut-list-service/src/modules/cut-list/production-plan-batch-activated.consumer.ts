import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { RabbitMqService } from "../../infrastructure/messaging/rabbitmq.service";

import { CutListsService } from "./cut-lists.service";

@Injectable()
export class ProductionPlanBatchActivatedConsumer implements OnModuleInit {
  private readonly logger = new Logger(ProductionPlanBatchActivatedConsumer.name);

  constructor(
    @Inject(RabbitMqService)
    private readonly rabbitMqService: RabbitMqService,
    @Inject(CutListsService)
    private readonly cutListsService: CutListsService
  ) {}

  onModuleInit(): void {
    this.rabbitMqService.consumeProductionPlanBatchActivated(async (event) => {
      const snapshot = await this.cutListsService.createSnapshotForActivatedBatch(
        event
      );

      this.logger.log(
        `Cut list snapshot ${snapshot.snapshot.id} is ready for ${event.planYear}/W${event.weekNumber}.`
      );
    });
  }
}
