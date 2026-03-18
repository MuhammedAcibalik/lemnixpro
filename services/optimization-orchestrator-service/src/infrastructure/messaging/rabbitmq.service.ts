import type {
  AmqpConnectionManager,
  Channel,
  ChannelWrapper
} from "amqp-connection-manager";
import { connect } from "amqp-connection-manager";
import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  messagingExchanges,
  routingKeys,
  type OptimizationQueueEnvelope
} from "@lemnixpro/shared-contracts";

@Injectable()
export class RabbitMqService implements OnApplicationShutdown {
  private connection: AmqpConnectionManager | null = null;
  private publisherChannel: ChannelWrapper | null = null;

  constructor(private readonly configService: ConfigService) {}

  async publish(envelope: OptimizationQueueEnvelope): Promise<void> {
    const bindings = this.getOptimizationBindings();
    const publishOptions = {
      contentType: "application/json",
      contentEncoding: "utf-8",
      persistent: true,
      timestamp: Date.parse(envelope.queuedAt)
    } as Parameters<ChannelWrapper["publish"]>[3];

    await this.getPublisherChannel().publish(
      bindings.exchange,
      bindings.requestedKey,
      Buffer.from(JSON.stringify(envelope)),
      publishOptions
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.publisherChannel?.close();
    await this.connection?.close();
  }

  private getConnectionUrl(): string {
    return this.configService.getOrThrow<string>("RABBITMQ_URL");
  }

  private getOptimizationRequestQueue(): string {
    return this.configService.getOrThrow<string>("OPTIMIZATION_REQUEST_QUEUE");
  }

  private getOptimizationBindings() {
    return {
      exchange: messagingExchanges.optimization,
      requestedKey: routingKeys.optimizationRequested,
      completedKey: routingKeys.optimizationCompleted,
      failedKey: routingKeys.optimizationFailed
    };
  }

  private getPublisherChannel(): ChannelWrapper {
    if (!this.publisherChannel) {
      const bindings = this.getOptimizationBindings();
      const queueName = this.getOptimizationRequestQueue();

      this.publisherChannel = this.getConnection().createChannel({
        setup: async (channel: Channel) => {
          await channel.assertExchange(bindings.exchange, "topic", {
            durable: true
          });
          await channel.assertQueue(queueName, {
            durable: true
          });
          await channel.bindQueue(
            queueName,
            bindings.exchange,
            bindings.requestedKey
          );
        }
      });
    }

    return this.publisherChannel;
  }

  private getConnection(): AmqpConnectionManager {
    if (!this.connection) {
      this.connection = connect([this.getConnectionUrl()]);
    }

    return this.connection;
  }
}
