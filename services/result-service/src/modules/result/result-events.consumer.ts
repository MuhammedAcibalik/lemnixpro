import { Inject, Injectable, OnModuleInit } from "@nestjs/common";

import type {
  OptimizationCompletedMessage,
  OptimizationFailedMessage
} from "@lemnixpro/shared-contracts";

import { RabbitMqService } from "../../infrastructure/messaging/rabbitmq.service";

import { ResultsService } from "./results.service";

@Injectable()
export class ResultEventsConsumer implements OnModuleInit {
  constructor(
    @Inject(RabbitMqService)
    private readonly rabbitMqService: RabbitMqService,
    @Inject(ResultsService)
    private readonly resultsService: ResultsService
  ) {}

  onModuleInit(): void {
    this.rabbitMqService.consumeResultEvents({
      completed: (message: OptimizationCompletedMessage) =>
        this.resultsService.recordCompleted(message).then(() => undefined),
      failed: (message: OptimizationFailedMessage) =>
        this.resultsService.recordFailed(message).then(() => undefined)
    });
  }
}
