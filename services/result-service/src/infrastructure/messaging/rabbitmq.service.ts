import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  messagingExchanges,
  routingKeys
} from "@lemnixpro/shared-contracts";

@Injectable()
export class RabbitMqService {
  constructor(private readonly configService: ConfigService) {}

  getConnectionUrl(): string {
    return this.configService.getOrThrow<string>("RABBITMQ_URL");
  }

  getResultBindings() {
    return {
      exchange: messagingExchanges.optimization,
      completedKey: routingKeys.optimizationCompleted,
      failedKey: routingKeys.optimizationFailed
    };
  }
}
