import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { RabbitMqService } from "../../infrastructure/messaging/rabbitmq.service";

import { OptimizationLifecycleService } from "./optimization-lifecycle.service";

@Injectable()
export class OptimizationLifecycleEventsConsumer implements OnModuleInit {
  constructor(
    @Inject(RabbitMqService)
    private readonly rabbitMqService: RabbitMqService,
    @Inject(OptimizationLifecycleService)
    private readonly optimizationLifecycleService: OptimizationLifecycleService,
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  onModuleInit(): void {
    if (
      this.configService.get<boolean>(
        "OPTIMIZATION_LIFECYCLE_CONSUMER_ENABLED",
        true
      ) !== true
    ) {
      return;
    }

    this.rabbitMqService.consumeOptimizationLifecycleEvents({
      started: (message) =>
        this.optimizationLifecycleService
          .applyStartedMessage(message)
          .then(() => undefined),
      completed: (message) =>
        this.optimizationLifecycleService
          .applyCompletedMessage(message)
          .then(() => undefined),
      failed: (message) =>
        this.optimizationLifecycleService
          .applyFailedMessage(message)
          .then(() => undefined)
    });
  }
}
