import { Module } from "@nestjs/common";

import { OPTIMIZATION_REQUEST_QUEUE_PUBLISHER } from "../../modules/optimization-orchestrator/optimization-request-queue.publisher";
import { RabbitMqService } from "./rabbitmq.service";

@Module({
  providers: [
    RabbitMqService,
    {
      provide: OPTIMIZATION_REQUEST_QUEUE_PUBLISHER,
      useExisting: RabbitMqService
    }
  ],
  exports: [RabbitMqService, OPTIMIZATION_REQUEST_QUEUE_PUBLISHER]
})
export class RabbitMqModule {}
