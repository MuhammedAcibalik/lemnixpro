import type {
  AmqpConnectionManager,
  ChannelWrapper
} from "amqp-connection-manager";
import { connect } from "amqp-connection-manager";
import { Inject, Injectable, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  messagingExchanges,
  routingKeys,
  type ProductionPlanBatchActivatedEvent,
  type ProductionPlanBatchCutListReconcileEvent
} from "@lemnixpro/shared-contracts";

type RabbitSetupChannel = {
  assertExchange(
    exchange: string,
    type: string,
    options: { durable: boolean }
  ): Promise<unknown>;
};

@Injectable()
export class RabbitMqService implements OnApplicationShutdown {
  private connection: AmqpConnectionManager | null = null;
  private publisherChannel: ChannelWrapper | null = null;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  async publishBatchActivated(
    event: ProductionPlanBatchActivatedEvent
  ): Promise<void> {
    const publishOptions = {
      contentType: "application/json",
      contentEncoding: "utf-8",
      persistent: true,
      messageId: event.metadata.messageId,
      correlationId: event.metadata.correlationId,
      timestamp: Date.parse(event.activatedAt)
    } as Parameters<ChannelWrapper["publish"]>[3];

    await this.getPublisherChannel().publish(
      messagingExchanges.productionPlan,
      routingKeys.productionPlanBatchActivated,
      Buffer.from(JSON.stringify(event)),
      publishOptions
    );
  }

  async publishCutListReconcile(
    event: ProductionPlanBatchCutListReconcileEvent
  ): Promise<void> {
    const publishOptions = {
      contentType: "application/json",
      contentEncoding: "utf-8",
      persistent: true,
      messageId: event.metadata.messageId,
      correlationId: event.metadata.correlationId,
      timestamp: Date.parse(event.occurredAt)
    } as Parameters<ChannelWrapper["publish"]>[3];

    await this.getPublisherChannel().publish(
      messagingExchanges.productionPlan,
      routingKeys.productionPlanBatchCutListReconcile,
      Buffer.from(JSON.stringify(event)),
      publishOptions
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.publisherChannel?.close();
    await this.connection?.close();
  }

  private getPublisherChannel(): ChannelWrapper {
    if (!this.publisherChannel) {
      this.publisherChannel = this.getConnection().createChannel({
        setup: async (channel: RabbitSetupChannel) => {
          await channel.assertExchange(
            messagingExchanges.productionPlan,
            "topic",
            {
              durable: true
            }
          );
        }
      });
    }

    return this.publisherChannel;
  }

  private getConnection(): AmqpConnectionManager {
    if (!this.connection) {
      this.connection = connect([
        this.configService.getOrThrow<string>("RABBITMQ_URL")
      ]);
    }

    return this.connection;
  }
}
